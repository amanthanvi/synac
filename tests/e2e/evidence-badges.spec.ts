import { test, expect } from '@playwright/test';

test('evidence badges, copy citation, and mappings visible for XSS', async ({ page, context }) => {
  // Grant clipboard permissions for deterministic verification
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:4321',
  });

  await page.goto('/terms/xss');

  // Evidence section renders with kind badges
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible();
  await expect(page.getByText('CWE').first()).toBeVisible();
  await expect(page.getByText('CAPEC').first()).toBeVisible();
  await expect(page.getByText('OTHER').first()).toBeVisible();

  // Normative/Informative badges are visible
  await expect(page.getByText('Normative').first()).toBeVisible();
  await expect(page.getByText('Informative').first()).toBeVisible();

  // Mappings render CWE and CAPEC IDs as badges
  await expect(page.getByText('CWE-79', { exact: true })).toBeVisible();
  await expect(page.getByText('CAPEC-63', { exact: true })).toBeVisible();

  // External source link exists and opens in new tab (target=_blank)
  const evidenceSection = page.locator('section[aria-labelledby="evidence-heading"]');
  const firstLink = evidenceSection.getByRole('link').first();
  await expect(firstLink).toBeVisible();
  await expect(firstLink).toHaveAttribute('target', '_blank');
  await expect(firstLink).toHaveAttribute('rel', /noopener/);

  // Copy single citation and verify live region announcement and clipboard content
  const copyOne = page.getByRole('button', { name: 'Copy citation' }).first();
  await expect(copyOne).toBeVisible();
  await copyOne.click();

  const live = page.locator('[data-cite-live][aria-live="polite"]').first();
  await expect(live).toHaveText(/Citation copied\./);

  const clip = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  });
  // Expect deterministic CWE format for first source
  expect(clip).toContain('CWE-79');
  expect(clip).toContain('https://cwe.mitre.org/data/definitions/79.html');
  expect(clip.trim().endsWith('(Normative)')).toBe(true);

  // Copy all citations (multi-source term) and verify newline-joined deterministic content
  const copyAll = page.getByRole('button', { name: 'Copy all citations' });
  await expect(copyAll).toBeVisible();
  await copyAll.click();
  await expect(live).toHaveText(/Citation copied\./);

  const clipAll = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  });
  const lines = (clipAll || '').split('\n').filter(Boolean);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(clipAll).toContain('CWE-79');
  expect(clipAll).toContain('CAPEC-63');
});
