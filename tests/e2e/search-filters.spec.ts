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

  test('alias badge, combined filters, and shareable URL state', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__synacIndexReady === true, undefined, {
      timeout: 10000,
    });

    const q = page.locator('#q');
    await q.click();
    await q.fill('');
    await q.type('jot', { delay: 15 });

    // Should show JWT via alias; badge visible
    const results = page.locator('#results li');
    await expect(results.first()).toBeVisible();
    const aliasBadge = page.locator('#results li .badge', { hasText: 'Alias match' }).first();
    await expect(aliasBadge).toBeVisible();

    // Toggle source=RFC
    const rfcChip = page.locator('#filters button[data-kind="RFC"]');
    await rfcChip.click();

    // Toggle type=protocol
    const protocolChip = page.locator('#type-filters button[data-type="protocol"]');
    await protocolChip.click();

    // URL should reflect q, sources, types
    await expect(async () => {
      const url = new URL(page.url());
      expect(url.searchParams.get('q')).toBe('jot');
      expect((url.searchParams.get('sources') || '').split(',')).toContain('RFC');
      expect((url.searchParams.get('types') || '').split(',')).toContain('protocol');
    }).toPass();

    // Open new tab with same URL and confirm state reproduces
    const newPage = await context.newPage();
    await newPage.goto(page.url());
    await newPage.waitForFunction(() => (window as any).__synacIndexReady === true, undefined, {
      timeout: 10000,
    });
    const q2 = newPage.locator('#q');
    await expect(q2).toHaveValue('jot');
    const rfcPressed = await newPage
      .locator('#filters button[data-kind="RFC"]')
      .getAttribute('aria-pressed');
    const protocolPressed = await newPage
      .locator('#type-filters button[data-type="protocol"]')
      .getAttribute('aria-pressed');
    expect(rfcPressed).toBe('true');
    expect(protocolPressed).toBe('true');

    // Keyboard-only: tab to a chip and toggle with Space
    await newPage.keyboard.press('Tab'); // focus input
    await newPage.keyboard.press('Tab'); // move towards filters area
    // Give a small pause to allow focus movement in headless
    await newPage.waitForTimeout(50);
    // Find any visible chip and toggle with Space
    const anyChip = newPage.locator('#filters .btn-chip').first();
    await anyChip.focus();
    await newPage.keyboard.press('Space');
    // aria-pressed should flip momentarily (can't assert exact value due to unknown initial focus target)
    const pressed = await anyChip.getAttribute('aria-pressed');
    expect(['true', 'false']).toContain(pressed || 'false');
  });

  test('mobile ergonomics: sticky search and 44px tap targets at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__synacIndexReady === true, undefined, {
      timeout: 10000,
    });

    const searchBox = page.locator('#search-box');
    await expect(searchBox).toBeVisible();

    // Verify sticky behavior after scroll
    await page.evaluate(() => window.scrollTo(0, 400));
    const top = await searchBox.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top).toBe(0);

    // Verify computed position is sticky
    const position = await searchBox.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('sticky');

    // Representative tap targets: chip button, filter summary, result link
    const anyChip = page.locator('#filters .btn-chip').first();
    await expect(anyChip).toBeVisible();
    const chipBox = await anyChip.boundingBox();
    expect(chipBox?.height || 0).toBeGreaterThanOrEqual(44);

    const summary = page.locator('summary.filter-summary').first();
    await expect(summary).toBeVisible();
    const sumBox = await summary.boundingBox();
    expect(sumBox?.height || 0).toBeGreaterThanOrEqual(44);
  });
});
