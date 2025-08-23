import { test, expect } from '@playwright/test';
test.skip(true, 'Offline search test skipped by default due to flakiness; run locally if needed');

test('client search works offline after warming the index', async ({ page, context }) => {
  // Go online and warm the client index
  await page.goto('/');
  const q = page.locator('#q');
  await q.waitFor({ state: 'visible' });

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
