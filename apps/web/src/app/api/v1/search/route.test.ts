import '../../../../test.setup';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { logger } from '@/lib/logger';
import { resetLocalRateLimitWindows } from '@/lib/rateLimit';

import { GET, OPTIONS } from './route';

async function waitUntil(isDone: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    if (isDone()) return;
    await new Promise((r) => setTimeout(r, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
}

async function settleDeferredSearchWork(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setTimeout(r, 100));
}

const prisma = createIntegrationTestClient();

function searchRequest(
  query: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/search${query}`, {
    headers: { 'user-agent': 'vitest-search-route', ...headers },
  });
}

async function createPublishedEntry(input: {
  slug: string;
  title: string;
  summary: string;
  definition: string;
  senseSlug?: string;
  senseLabel?: string;
}) {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: input.summary,
      summaryText: input.summary,
    },
    select: { id: true },
  });

  await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 0,
      definitionMd: input.definition,
      definitionText: input.definition,
      status: 'PUBLISHED',
      slug: input.senseSlug ?? null,
      senseLabel: input.senseLabel ?? null,
    },
  });

  return entry;
}

describe('GET /api/v1/search integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    resetLocalRateLimitWindows();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns matches with a total and without exposing ranking internals', async () => {
    await createPublishedEntry({
      slug: 'saml',
      title: 'SAML',
      summary: 'Security Assertion Markup Language.',
      definition: 'SAML is used for federated authentication.',
    });

    const response = await GET(searchRequest('?q=saml&page=1'));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.results).toHaveLength(1);
    expect(payload.scope).toBe('entries');
    expect(payload.meta.total).toBe(1);
    expect(payload.total).toBe(1);
    expect(payload.meta.page).toBe(1);
    expect(payload.meta.pageSize).toBe(20);
    expect(payload.meta.pageCount).toBe(1);

    // `score` and `bucket` are tuning knobs; publishing them would freeze them.
    const [first] = payload.results;
    expect(first).not.toHaveProperty('score');
    expect(first).not.toHaveProperty('bucket');
    expect(first.url).toBe('/term/saml');
  });

  it('reports a zero total for an empty query without touching the index', async () => {
    const payload = await (await GET(searchRequest('?q=%20%20'))).json();

    expect(payload.results).toEqual([]);
    expect(payload.meta.total).toBe(0);
    expect(payload.total).toBe(0);
  });

  it('sets the public cache, ETag, and CORS headers', async () => {
    await createPublishedEntry({
      slug: 'saml',
      title: 'SAML',
      summary: 'Security Assertion Markup Language.',
      definition: 'SAML is used for federated authentication.',
    });

    const response = await GET(searchRequest('?q=saml'));

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    expect(Number(response.headers.get('x-ratelimit-remaining'))).toBeLessThan(
      60,
    );

    const etag = response.headers.get('etag') ?? '';
    expect(etag).toMatch(/^"[0-9a-f]{40}"$/);

    const conditional = await GET(
      searchRequest('?q=saml', { 'if-none-match': etag }),
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
  });

  it('answers a CORS preflight', () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'GET',
    );
  });

  it('rejects an unknown scope', async () => {
    const response = await GET(searchRequest('?q=saml&scope=galaxies'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_scope');
  });

  it('serves meaning-level results whose urls carry the sense fragment', async () => {
    await createPublishedEntry({
      slug: 'saml',
      title: 'SAML',
      summary: 'Security Assertion Markup Language.',
      definition: 'SAML is used for federated authentication.',
      senseSlug: 'federated-auth',
      senseLabel: 'Federated authentication',
    });

    const response = await GET(
      searchRequest('?q=federated%20authentication&scope=senses'),
    );
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.scope).toBe('senses');
    expect(typeof payload.meta.total).toBe('number');
    expect(payload.total).toBe(payload.meta.total);
    expect(payload.results.length).toBeGreaterThan(0);

    for (const item of payload.results) {
      expect(item.url).toContain('#s-');
      expect(item.entrySlug).toBe('saml');
      expect(item.entryTitle).toBe('SAML');
      expect(item.citationRecordUrl).toBe(
        `/api/v1/senses/${item.senseId}/citation.json`,
      );
      expect(item).not.toHaveProperty('score');
      expect(item).not.toHaveProperty('bucket');
    }
  });

  it('does not emit search-index coverage diagnostics for normal autocomplete traffic', async () => {
    await createPublishedEntry({
      slug: 'saml',
      title: 'SAML',
      summary: 'Security Assertion Markup Language.',
      definition: 'SAML is used for federated authentication.',
    });

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const response = await GET(searchRequest('?q=saml&page=1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(1);
    await settleDeferredSearchWork();
    expect(
      infoSpy.mock.calls.some((call) => call[0] === 'search.index.coverage'),
    ).toBe(false);
  });

  it('emits search-index coverage diagnostics only for anomalous searches with real missing index rows', async () => {
    const entry = await createPublishedEntry({
      slug: 'authentication',
      title: 'Authentication',
      summary: 'Authentication verifies an identity.',
      definition: 'Authentication verifies an identity before access.',
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: entry.id } });

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const response = await GET(searchRequest('?q=authentication&page=1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(0);
    await waitUntil(
      () =>
        infoSpy.mock.calls.some((call) => call[0] === 'search.index.coverage'),
      'the search.index.coverage log',
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'search.index.coverage',
      expect.objectContaining({ location: 'api_v1_search' }),
    );
  });
});
