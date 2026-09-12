import { expect, test } from '@playwright/test';

import { SEED, apiUrl } from './helpers';

test.describe('routing', () => {
  test('a term URL for an acronym redirects permanently', async ({
    request,
  }) => {
    const response = await request.get(
      apiUrl(`/term/${SEED.redirectingAcronym}`),
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toContain(
      `/acronym/${SEED.redirectingAcronym}`,
    );
  });

  test('an unknown entry slug returns 404', async ({ request }) => {
    const response = await request.get(
      apiUrl('/term/this-slug-does-not-exist-9f3a'),
    );
    expect(response.status()).toBe(404);
  });

  test('an unknown tag returns 404', async ({ request }) => {
    const response = await request.get(apiUrl('/tags/nonexistent'));
    expect(response.status()).toBe(404);
  });
});
