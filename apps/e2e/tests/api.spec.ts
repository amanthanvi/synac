import { expect, test } from '@playwright/test';

import { SEEDED } from './helpers.js';

test.describe('public read API', () => {
  test('serves an OpenAPI document', async ({ request }) => {
    const response = await request.get('/api/v1/openapi.json');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('json');

    expect(await response.json()).toMatchObject({
      openapi: expect.any(String),
    });
  });

  test('search returns a total count', async ({ request }) => {
    const response = await request.get(`/api/v1/search?q=${SEEDED.looseQuery}`);

    expect(response.status()).toBe(200);

    // The search endpoint always answers 200 with a `meta.total` count.
    const body = (await response.json()) as { meta: { total: number } };
    expect(typeof body.meta.total).toBe('number');
  });

  test('healthz reports ok', async ({ request }) => {
    const response = await request.get('/api/healthz');
    expect(response.status()).toBe(200);
  });

  test('an ETag round-trip returns 304', async ({ request }) => {
    const first = await request.get('/api/v1/acronyms?page=1');
    expect(first.status()).toBe(200);

    const etag = first.headers()['etag'];
    expect(etag, 'the read API must send an ETag').toBeTruthy();

    const second = await request.get('/api/v1/acronyms?page=1', {
      headers: { 'If-None-Match': etag ?? '' },
    });

    expect(second.status()).toBe(304);
  });
});
