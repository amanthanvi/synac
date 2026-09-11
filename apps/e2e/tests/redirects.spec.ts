import { expect, test } from '@playwright/test';

import { SEEDED } from './helpers.js';

test.describe('canonical routing', () => {
  test('/term/<acronym-slug> permanently redirects to /acronym/<slug>', async ({
    request,
  }) => {
    const response = await request.get(`/term/${SEEDED.acronymSlug}`, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toContain(
      `/acronym/${SEEDED.acronymSlug}`,
    );
  });

  test('an unknown entry slug 404s', async ({ request }) => {
    const response = await request.get(
      '/term/definitely-not-a-real-entry-xyz',
      {
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBe(404);
  });

  test('an unknown tag slug 404s', async ({ request }) => {
    const response = await request.get('/tags/nonexistent', {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
  });
});
