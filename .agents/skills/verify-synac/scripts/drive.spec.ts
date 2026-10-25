import { expect, test, type Page } from '@playwright/test';

import { capture } from './evidence';

async function shot(page: Page, name: string) {
  await capture(page, name);
}

test('home lists recent entries', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'SynAc' }),
  ).toBeVisible();
  const recent = page.getByRole('region', { name: 'Recently updated' });
  await expect(recent.getByRole('link').first()).toBeVisible();
  await shot(page, 'home.png');
});

test('search empty, ignored, filtered, and hostile queries', async ({
  page,
}) => {
  await page.goto('/search');
  await expect(page.getByText('Search published entries')).toBeVisible();
  await shot(page, 'search-empty.png');

  await page.goto('/search?q=the');
  await expect(page.getByText('Try a more specific query')).toBeVisible();

  await page.goto('/search?q=soc&type=TERM&scope=senses');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Search' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meanings' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page.locator('a[href*="/term/"], a[href*="/acronym/"]').first(),
  ).toBeVisible();
  await shot(page, 'search-soc.png');

  await page.goto('/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Search' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search' })).toHaveValue(
    '<script>alert(1)</script>',
  );
});

test('command palette opens from the keyboard and navigates', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search' }).waitFor();
  const input = page.getByRole('combobox', {
    name: 'Search terms and acronyms',
  });
  await expect(async () => {
    await page.keyboard.press('Control+KeyK');
    await expect(input).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await input.fill('soc');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/(search|term|acronym)/);
  await shot(page, 'palette.png');
});

test('terms browse letter, sort, filter, and a rejected letter', async ({
  page,
}) => {
  await page.goto('/terms?letter=d');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Terms' }),
  ).toBeVisible();
  const letters = page.getByRole('navigation', { name: 'Term letters' });
  await expect(
    letters.getByRole('link', { name: 'd', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('a[href^="/term/"]').first()).toBeVisible();
  await shot(page, 'terms-d.png');

  await page.getByRole('combobox', { name: 'Sort' }).selectOption('updated');
  await expect(page).toHaveURL(/sort=updated/);

  const filter = page.getByRole('textbox', { name: 'Filter entries' });
  await filter.fill('domain');
  await expect(page).toHaveURL(/q=domain/, { timeout: 10_000 });
  await expect(page.locator('a[href="/term/domain"]')).toBeVisible();

  await page.goto('/terms?letter=DROP%20TABLE');
  await expect(
    letters.getByRole('link', { name: 'a', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
});

test('acronyms browse opens BLACK', async ({ page }) => {
  await page.goto('/acronyms');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Acronyms' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Acronym letters' })
    .getByRole('link', { name: 'b', exact: true })
    .click();
  await expect(page).toHaveURL(/letter=b/);
  await page.locator('a[href="/acronym/black"]').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'BLACK' }),
  ).toBeVisible();
  await shot(page, 'acronym-black.png');
});

test('entry page copy link and citation record', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/term/access-control');
  await expect(
    page.getByRole('heading', { level: 1, name: 'access control' }),
  ).toBeVisible();
  const toc = page.locator('a[href^="#sense-"]:visible').first();
  await expect(toc).toBeVisible();
  const fragment = await toc.getAttribute('href');
  expect(fragment).toBeTruthy();
  await toc.click();
  await expect(page).toHaveURL(new RegExp(`${fragment}$`));

  await page
    .getByRole('button', { name: 'Copy link to this sense' })
    .first()
    .click();
  await expect(page.getByRole('status').first()).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('/term/access-control#');
  await shot(page, 'entry-access-control.png');

  await page.getByText('Cite', { exact: true }).first().click();
  const jsonLink = page
    .getByRole('link', { name: 'Citation record (JSON)' })
    .first();
  await expect(jsonLink).toBeVisible();
  const href = await jsonLink.getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(href ?? '');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    slug?: string;
    primaryCitation?: { sourceSlug?: string };
  };
  expect(body.slug).toBe('access-control');
  expect(body.primaryCitation?.sourceSlug).toBeTruthy();
});

test('tags filter, empty filter, and a tag page', async ({ page }) => {
  await page.goto('/tags');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tags' }),
  ).toBeVisible();
  const filter = page.getByRole('textbox', { name: 'Filter tags' });
  await filter.fill('zzzz-no-such-tag');
  await expect(page.getByText('No matching tags.')).toBeVisible();
  await filter.fill('identity');
  await page.getByRole('link', { name: 'Identity and access' }).click();
  await expect(page).toHaveURL(/\/tags\/identity-access$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Identity and access' }),
  ).toBeVisible();
  await shot(page, 'tag-identity-access.png');
});

test('sources list opens RFC 4949', async ({ page }) => {
  await page.goto('/sources');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sources' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /RFC 4949/ }).click();
  await expect(page).toHaveURL(/\/sources\/rfc4949$/);
  await expect(
    page.getByRole('region', { name: 'Source facts' }),
  ).toBeVisible();
  await shot(page, 'source-rfc4949.png');
});

test('recent page paginates inside the cap', async ({ page }) => {
  await page.goto('/recent');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Recently updated' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Pagination' }),
  ).toContainText('Page 1');
  await page.goto('/recent?page=99');
  await expect(page).toHaveURL(/\/recent\?page=4/);
  await shot(page, 'recent.png');
});

test('changelog page and rss feed', async ({ page, request }) => {
  await page.goto('/changelog');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Changelog' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'RSS' })).toHaveAttribute(
    'href',
    '/changelog/rss.xml',
  );
  const rss = await request.get('/changelog/rss.xml');
  expect(rss.status()).toBe(200);
  expect(await rss.text()).toContain('<rss');
  await shot(page, 'changelog.png');
});

test('about page', async ({ page }) => {
  await page.goto('/about');
  await expect(
    page.getByRole('heading', { level: 1, name: 'About SynAc' }),
  ).toBeVisible();
  await shot(page, 'about.png');
});

test('legal privacy and terms', async ({ page }) => {
  await page.goto('/legal/privacy');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
  ).toBeVisible();
  await page.goto('/legal/terms');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Terms of Use' }),
  ).toBeVisible();
  await shot(page, 'legal-terms.png');
});

test('theme cycles and survives reload', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /Theme:/ });
  await expect(toggle).toHaveAttribute('aria-label', 'Theme: System');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Theme: Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('synac-theme'),
  );
  expect(stored).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, 'theme-dark.png');
});

test('header, footer, and mobile menu', async ({ page }) => {
  await page.goto('/');
  await expect(
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Terms' }),
  ).toBeVisible();
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page
    .getByRole('navigation', { name: 'Mobile' })
    .getByRole('link', { name: 'Tags' })
    .click();
  await expect(page).toHaveURL(/\/tags$/);
  await shot(page, 'mobile-tags.png');
});

test('missing entry and acronym redirect', async ({ page, request }) => {
  await page.goto('/term/this-slug-does-not-exist-9f3a');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible();
  await shot(page, 'not-found.png');
  await page.goto('/term/2fa');
  await expect(page).toHaveURL(/\/acronym\/2fa$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const toAcronym = await request.get('/term/2fa', { maxRedirects: 0 });
  expect(toAcronym.status()).toBe(308);
  expect(toAcronym.headers()['location'] ?? '').toContain('/acronym/2fa');

  const toTerm = await request.get('/acronym/access-control', {
    maxRedirects: 0,
  });
  expect(toTerm.status()).toBe(308);
  expect(toTerm.headers()['location'] ?? '').toContain('/term/access-control');
});

test('public api search, etag, openapi, and export', async ({ request }) => {
  const search = await request.get('/api/v1/search?q=soc');
  expect(search.status()).toBe(200);
  const body = (await search.json()) as {
    meta?: { total?: number };
    results?: unknown[];
  };
  expect(body.meta?.total ?? 0).toBeGreaterThan(0);
  expect(Array.isArray(body.results)).toBe(true);

  const ignored = await request.get('/api/v1/search?q=the');
  expect(ignored.status()).toBe(200);
  const ignoredBody = (await ignored.json()) as { meta?: { total?: number } };
  expect(ignoredBody.meta?.total).toBe(0);

  const etag = search.headers()['etag'] ?? '';
  expect(etag).toBeTruthy();
  const cached = await request.get('/api/v1/search?q=soc', {
    headers: { 'if-none-match': etag },
  });
  expect(cached.status()).toBe(304);

  const spec = await request.get('/api/v1/openapi.json');
  expect(spec.status()).toBe(200);
  const specBody = (await spec.json()) as { openapi?: string };
  expect(specBody.openapi).toMatch(/^3\./);

  const entry = await request.get(
    '/api/v1/entries/by-slug?type=TERM&slug=access-control',
  );
  expect(entry.status()).toBe(200);
  const entryBody = (await entry.json()) as { entry?: { slug?: string } };
  expect(entryBody.entry?.slug).toBe('access-control');

  const missing = await request.get(
    '/api/v1/entries/by-slug?type=TERM&slug=this-slug-does-not-exist-9f3a',
  );
  expect(missing.status()).toBe(404);

  const exported = await request.get('/api/v1/export/entries.json?page=1');
  expect(exported.status()).toBe(200);
  const exportBody = (await exported.json()) as { results?: unknown[] };
  expect((exportBody.results ?? []).length).toBeGreaterThan(0);
});

test('journey from search to a saved theme', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('textbox', { name: 'Search' });
  await search.fill('access control');
  await search.press('Enter');
  await expect(page).toHaveURL(
    /\/search\?q=access\+control|\/search\?q=access%20control/,
  );
  await page.locator('a[href="/term/access-control"]').first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'access control' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Theme:/ }).click();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('synac-theme'),
  );
  expect(stored).toBe('dark');
  await shot(page, 'journey-home-dark.png');
});
