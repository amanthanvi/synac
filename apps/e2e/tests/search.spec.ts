import { expect, test } from '@playwright/test';

import { ROUTES, SEED } from './helpers';

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('search and navigation', () => {
  test('search results link through to an entry page', async ({ page }) => {
    await page.goto(ROUTES.search);

    const results = page
      .getByRole('main')
      .locator('a[href^="/term/"], a[href^="/acronym/"]');
    await expect(results.first()).toBeVisible();

    const first = results.first();
    const href = await first.getAttribute('href');
    expect(href, 'the first result should link to an entry').toMatch(
      /^\/(term|acronym)\//,
    );

    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a sense table of contents link jumps to an attached target', async ({
    page,
  }) => {
    await page.goto(ROUTES.term);

    // The rail and the mobile chip row share targets; take the visible one.
    const tocLink = page.locator('a[href^="#sense-"]:visible').first();
    await expect(tocLink).toBeVisible();

    const fragment = await tocLink.getAttribute('href');
    expect(fragment).toBeTruthy();
    if (!fragment) return;
    const targetId = fragment.slice(1);

    await tocLink.click();
    await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(fragment)}$`));

    // The anchor must resolve to a node that is really in the document. A
    // table of contents that points at an id nothing renders is the failure
    // this guards against.
    const target = page.locator(`[id="${targetId}"]`);
    await expect(target).toHaveCount(1);
    await expect(target).toBeAttached();
  });

  test('the command palette opens from the keyboard and navigates', async ({
    page,
  }) => {
    await page.goto(ROUTES.home);
    // The shortcut listener attaches after hydration.
    await page.waitForLoadState('networkidle');

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    const input = page.getByRole('combobox');
    // The shortcut listener attaches after hydration; press until it answers.
    await expect(async () => {
      await page.keyboard.press(`${modifier}+KeyK`);
      await expect(input).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await expect(input).toBeFocused();

    await input.fill(SEED.query);
    await expect(page.getByRole('option').first()).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page).not.toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
