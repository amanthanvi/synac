/**
 * Note:
 * This offline search E2E is skipped by default because service worker lifecycle and caching
 * behavior can be timing-sensitive in headless CI environments. The test is reliable locally
 * with index warming and fallbacks, but can still occasionally flake in CI.
 *
 * To run locally:
 *   - Remove the test.skip(true, ...) line below
 *   - Ensure `astro dev` is running with PWA devOptions enabled (see astro.config.mjs)
 *   - Run: npm run e2e
 *
 * CI strategy:
 *   - Keep this spec skipped by default to maintain deterministic builds.
 *   - The functional path remains covered by unit tests and the evidence E2E path.
 */
import { test, expect } from '@playwright/test';
/* unskipped for PR9 offline determinism */

test('client search works offline after warming the index', async ({ page, context }) => {
  // Go online and warm the client index
  await page.goto('/');
  const q = page.locator('#q');
  await q.waitFor({ state: 'visible' });

  // Wait until client search index is revived/warmed
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (window as any).__synacIndexReady === true)) ? 'ready' : 'not',
      { timeout: 20000 },
    )
    .toBe('ready');

  // Trigger ensureIndex by performing an initial search online
  await q.fill('cross');
  await expect
    .poll(async () => await page.locator('#results li').count(), { timeout: 15000 })
    .toBeGreaterThan(0);
  const initialCount = await page.locator('#results li').count();
  expect(initialCount).toBeGreaterThan(0);

  // Now simulate offline mode
  await context.setOffline(true);

  // Clear and search again while offline - should use in-memory index
  await q.fill('');
  await q.fill('cross');
  await expect
    .poll(async () => await page.locator('#results li').count(), { timeout: 15000 })
    .toBeGreaterThan(0);
  const offlineCount = await page.locator('#results li').count();
  expect(offlineCount).toBeGreaterThan(0);
});
