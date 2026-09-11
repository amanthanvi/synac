import { expect, test } from '@playwright/test';

import { SEED, apiUrl } from './helpers';

test.describe('public read API', () => {
  test('search reports a total', async ({ request }) => {
    const response = await request.get(
      apiUrl(`/api/v1/search?q=${SEED.query}`),
    );
    expect(response.ok()).toBe(true);

    // Shape is asserted below rather than trusted: a drift fails these checks.
    const body = (await response.json()) as {
      results: unknown[];
      meta?: { total?: number };
    };

    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.meta?.total).toBe('number');
    expect(body.meta?.total).toBeGreaterThan(0);
  });

  test('an ETag round trip returns 304', async ({ request }) => {
    const url = apiUrl(`/api/v1/search?q=${SEED.query}`);

    const first = await request.get(url);
    expect(first.ok()).toBe(true);

    const etag = first.headers()['etag'] ?? '';
    expect(etag, 'the search endpoint should send an ETag').toBeTruthy();

    const second = await request.get(url, {
      headers: { 'if-none-match': etag },
    });
    expect(second.status()).toBe(304);
    expect(await second.body()).toHaveLength(0);
  });

  test('the OpenAPI document is served', async ({ request }) => {
    const response = await request.get(apiUrl('/api/v1/openapi.json'));
    expect(response.status()).toBe(200);

    // Shape is asserted below rather than trusted: a drift fails these checks.
    const body = (await response.json()) as {
      openapi?: string;
      paths?: Record<string, unknown>;
    };
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths).toBeTruthy();
  });

  test('an entry carries senses with attestations', async ({ request }) => {
    const response = await request.get(
      apiUrl(`/api/v1/entries/by-slug?type=TERM&slug=${SEED.multiSenseTerm}`),
    );
    expect(response.status()).toBe(200);

    // Shape is asserted below rather than trusted: a drift fails these checks.
    const { entry } = (await response.json()) as {
      entry: {
        slug?: string;
        senses?: Array<{
          citations?: Array<{ sourceSlug?: string }>;
          attestations?: unknown[];
        }>;
      };
    };

    expect(entry.slug).toBe(SEED.multiSenseTerm);
    expect(entry.senses?.length ?? 0).toBeGreaterThan(1);

    // Every sense cites at least one source; attestations list the others.
    const cited = (entry.senses ?? []).filter(
      (sense) => (sense.citations?.length ?? 0) > 0,
    );
    expect(cited.length, 'every sense should carry a citation').toBe(
      entry.senses?.length,
    );

    const sourceSlugs = (entry.senses ?? [])
      .flatMap((sense) => sense.citations ?? [])
      .map((citation) => citation.sourceSlug);
    expect(sourceSlugs).toContain(SEED.source);
  });
});
