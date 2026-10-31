import { expect, test } from '@playwright/test';

import { capture } from './evidence';

test('home search opens an entry', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'SynAc' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Recently updated' }),
  ).toBeVisible();
  await capture(page, 'smoke-home.png');

  const search = page.getByRole('textbox', { name: 'Search' });
  await search.fill('soc');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=soc/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Search' }),
  ).toBeVisible();
  const results = page.locator('a[href^="/term/"], a[href^="/acronym/"]');
  await expect(results.first()).toBeVisible();
  await capture(page, 'smoke-search.png');

  const href = await results.first().getAttribute('href');
  expect(href).toBeTruthy();
  await results.first().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'smoke-entry.png');
});
