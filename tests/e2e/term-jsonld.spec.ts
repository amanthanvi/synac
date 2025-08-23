import { test, expect } from '@playwright/test';

test.describe('Term JSON-LD endpoint and reference', () => {
  test('serves JSON-LD and references it from the term page', async ({ page, request }) => {
    // Verify endpoint returns JSON-LD for a known term
    const res = await request.get('/terms/xss.jsonld');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('application/ld+json');
    const body = await res.json();
    expect(body['@type']).toBe('DefinedTerm');
    expect(body.name.toLowerCase()).toContain('cross-site');

    // Verify term page includes external JSON-LD script reference (no inline JSON)
    await page.goto('/terms/xss');
    const script = page.locator('script[type="application/ld+json"][src="/terms/xss.jsonld"]');
    await expect(script).toHaveCount(1);
  });
});
