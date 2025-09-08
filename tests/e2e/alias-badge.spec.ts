import { test, expect } from '@playwright/test';

test.describe('Alias badge shows matched token', () => {
  test("renders “Matched via alias '<token>'” for common aliases", async ({ page }) => {
    await page.goto('/');
    // Wait for client index ready if available, else continue (fallback mode will still work)
    try {
      await page.waitForFunction(() => (window as any).__synacIndexReady === true, undefined, {
        timeout: 15000,
      });
    } catch {}

    const q = page.locator('#q');
    await expect(q).toBeVisible();

    const waitForAnyResult = async () => {
      await expect
        .poll(async () => await page.locator('#results .result-item').count(), { timeout: 15000 })
        .toBeGreaterThan(0);
    };

    const assertAlias = async (query: string, expectedSlug: string) => {
      await q.fill('');
      await q.type(query, { delay: 15 });
      await waitForAnyResult();

      // Robust selectors per current markup:
      // .result-item > a.result-link[href^="/terms/"] with a .result-title containing the alias badge
      const target = page
        .locator(`.result-item > a.result-link[href="/terms/${expectedSlug}"]`)
        .first();
      await expect(target).toBeVisible({ timeout: 15000 });
      const title = target.locator('.result-title');
      await expect(title).toContainText(`Matched via alias '${query}'`, { timeout: 15000 });
    };

    // mitm → AITM
    await assertAlias('mitm', 'aitm');

    // jot → JWT
    await assertAlias('jot', 'jwt');

    // ssl → TLS
    await assertAlias('ssl', 'tls');
  });
});
