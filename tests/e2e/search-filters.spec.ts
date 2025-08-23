import { test, expect } from '@playwright/test';

test.describe('Search filters and highlighting', () => {
  test('applies source-kind chips and highlights matches', async ({ page }) => {
    await page.goto('/');
    // Wait for client search island to hydrate and index to be ready
    await page.waitForFunction(() => (window as any).__synacIndexReady === true, undefined, {
      timeout: 10000,
    });

    const q = page.locator('#q');
    await expect(q).toBeVisible();

    // Start with XSS (has CWE and CAPEC kinds)
    await q.click();
    await q.fill('');
    await q.type('cross', { delay: 20 });

    const results = page.locator('#results li');
    const countEl = page.locator('#count');
    await expect(countEl).toContainText(/result/i, { timeout: 15000 });

    // Highlighting: term should contain <mark> when searching
    const titleStrong = page.locator('#results li >> strong').first();
    await expect(titleStrong).toContainText(/cross/i);
    // Ensure innerHTML has <mark> around search token
    const inner = await titleStrong.innerHTML();
    expect(inner.toLowerCase()).toContain('<mark>cross</mark>');

    // Toggle RFC chip; if full payload available, XSS has no RFC -> expect zero results.
    // In DOM fallback (no sourceKinds), filter effects are undefined; skip strict assertions.
    const rfcChip = page.locator('#filters button[data-kind="RFC"]');
    await expect(rfcChip).toBeVisible();
    await rfcChip.click();
    const mode = await countEl.getAttribute('data-mode');
    const isFallback = mode === 'fallback';
    if (!isFallback) {
      await expect(results).toHaveCount(0);

      // Enable CWE filter; XSS has CWE, so results should appear
      const cweChip = page.locator('#filters button[data-kind="CWE"]');
      await cweChip.click();
      await expect(countEl).toContainText(/result/i, { timeout: 15000 });

      // Add CAPEC filter; still should have results (XSS has CAPEC)
      const capecChip = page.locator('#filters button[data-kind="CAPEC"]');
      await capecChip.click();
      await expect(countEl).toContainText(/result/i, { timeout: 15000 });
    } else {
      // Fallback mode: ensure count remains readable
      await expect(countEl).toBeVisible();
    }

    // Check that count aria-live updates
    await expect(countEl).toBeVisible();
    const countText = (await countEl.textContent()) || '';
    expect(countText.toLowerCase()).toContain('result');
  });
});
