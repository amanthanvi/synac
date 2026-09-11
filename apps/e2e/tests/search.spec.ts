import { expect, test } from '@playwright/test';

import { ENTRY_LINK_SELECTOR, SEEDED, gotoStable } from './helpers.js';

test.describe('search → entry → sense → citation', () => {
  test('searching finds a seeded entry and opens its page', async ({
    page,
  }) => {
    await gotoStable(page, `/search?q=${SEEDED.query}`);

    const results = page.locator(`ol li ${ENTRY_LINK_SELECTOR}`);
    await expect(results.first()).toBeVisible();

    const href = await results.first().getAttribute('href');
    expect(href).toBeTruthy();

    await results.first().click();
    await expect(page).toHaveURL(new RegExp(`${href ?? ''}$`));
    await expect(page.locator('h1')).toBeVisible();
  });

  test('sense fragment links resolve to a sense on the entry page', async ({
    page,
  }) => {
    await gotoStable(page, `/acronym/${SEEDED.multiSenseAcronymSlug}`);

    // The mobile chip row and the desktop rail both link to senses; pick the visible one.
    const senseLink = page.locator('a[href*="#s-"]:visible').first();
    await expect(senseLink).toBeVisible();

    const href = await senseLink.getAttribute('href');
    const fragment = href?.slice(href.indexOf('#') + 1) ?? '';
    expect(fragment).toMatch(/^s-/);

    await senseLink.click();
    await expect(page).toHaveURL(new RegExp(`#${fragment}$`));

    const target = page.locator(`[id="${fragment}"]`);
    await expect(target).toBeAttached();
  });

  test('a citation popover opens from the keyboard', async ({ page }) => {
    await gotoStable(page, `/acronym/${SEEDED.acronymSlug}`);

    const pill = page.locator('button[data-citation-pill]').first();
    const count = await page
      .locator('button[aria-expanded][aria-controls]')
      .count();
    test.skip(count === 0, 'entry page has no citation pills');

    await pill.focus();
    await expect(pill).toBeFocused();
    await expect(pill).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Enter');
    await expect(pill).toHaveAttribute('aria-expanded', 'true');

    const panelId = await pill.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    await expect(page.locator(`[id="${panelId ?? ''}"]`)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
  });
});
