import { test, expect } from '@playwright/test';

test('evidence badges and mappings visible for XSS', async ({ page }) => {
  await page.goto('/terms/xss');

  // Sources section renders with kind badges
  await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible();
  await expect(page.getByText('CWE').first()).toBeVisible();
  await expect(page.getByText('CAPEC').first()).toBeVisible();
  await expect(page.getByText('OTHER').first()).toBeVisible();

  // Mappings render CWE and CAPEC IDs as badges
  await expect(page.getByText('CWE-79', { exact: true })).toBeVisible();
  await expect(page.getByText('CAPEC-63', { exact: true })).toBeVisible();

  // External source link exists and opens in new tab (target=_blank)
  const link = page.getByRole('link', { name: 'View source' }).first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
});
