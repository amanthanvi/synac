/**
 * End-to-end smoke coverage for every public route: each one is imported and
 * invoked against a real database, so a broken Prisma select or a mis-shaped
 * payload fails here rather than in production.
 */
import '../../../../test.setup';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { resetLocalRateLimitWindows } from '@/lib/rateLimit';

import {
  createPublishedEntryWithCitation,
  createSourceBundle,
} from './fixtures';

const prisma = createIntegrationTestClient();

let entryId = '';
let senseId = '';

beforeAll(async () => {
  await resetIntegrationDatabase(prisma);
  resetLocalRateLimitWindows();
  const { citationId } = await createSourceBundle(prisma);
  const created = await createPublishedEntryWithCitation(prisma, {
    slug: 'phishing',
    title: 'Phishing',
    citationId,
    senseSlug: 'credential-theft',
    tagSlug: 'social-engineering',
  });
  entryId = created.entryId;
  senseId = created.senseId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function req(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

describe('public API smoke', () => {
  it('healthz', async () => {
    const { GET } = await import('@/app/api/healthz/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('openapi.json', async () => {
    const { GET } = await import('../openapi.json/route');
    const res = await GET(req('/api/v1/openapi.json'));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
  });

  it('terms + acronyms', async () => {
    const terms = await import('../terms/route');
    const r1 = await terms.GET(req('/api/v1/terms?letter=p&sort=updated'));
    expect(r1.status).toBe(200);
    expect((await r1.json()).items).toHaveLength(1);

    const acr = await import('../acronyms/route');
    const r2 = await acr.GET(req('/api/v1/acronyms'));
    expect(r2.status).toBe(200);

    const bad = await terms.GET(req('/api/v1/terms?letter=zz'));
    expect(bad.status).toBe(400);
  });

  it('entries/{id}', async () => {
    const { GET } = await import('../entries/[id]/route');
    const res = await GET(req(`/api/v1/entries/${entryId}`), {
      params: Promise.resolve({ id: entryId }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).entry.slug).toBe('phishing');

    const bad = await GET(req('/api/v1/entries/not-a-uuid'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(bad.status).toBe(404);
  });

  it('tags/{slug}/entries', async () => {
    const { GET } = await import('../tags/[slug]/entries/route');
    const res = await GET(req('/api/v1/tags/social-engineering/entries'), {
      params: Promise.resolve({ slug: 'social-engineering' }),
    });
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.items).toHaveLength(1);
    expect(p.meta.total).toBe(1);

    const missing = await GET(req('/api/v1/tags/nope/entries'), {
      params: Promise.resolve({ slug: 'nope' }),
    });
    expect(missing.status).toBe(404);
  });

  it('sources + sources/{slug}', async () => {
    const list = await import('../sources/route');
    const r1 = await list.GET(req('/api/v1/sources'));
    expect(r1.status).toBe(200);
    const p1 = await r1.json();
    expect(p1.items).toHaveLength(1);
    expect(p1.items[0].citedEntryCount).toBe(1);

    const one = await import('../sources/[slug]/route');
    const r2 = await one.GET(req('/api/v1/sources/nist-csrc'), {
      params: Promise.resolve({ slug: 'nist-csrc' }),
    });
    expect(r2.status).toBe(200);
    const p2 = await r2.json();
    expect(p2.items).toHaveLength(1);

    const r3 = await one.GET(req('/api/v1/sources/nope'), {
      params: Promise.resolve({ slug: 'nope' }),
    });
    expect(r3.status).toBe(404);
  });

  it('senses/{id}/citation.json', async () => {
    const { GET } = await import('../senses/[id]/citation.json/route');
    const res = await GET(req(`/api/v1/senses/${senseId}/citation.json`), {
      params: Promise.resolve({ id: senseId }),
    });
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.sense.url).toBe('/term/phishing#s-credential-theft');
    expect(p.attestations[0].source.name).toBe('NIST CSRC');
    expect(p.attestations[0].document.contentSha256).toHaveLength(64);
  });

  it('export json + csv', async () => {
    const j = await import('../export/entries.json/route');
    const r1 = await j.GET(
      req('/api/v1/export/entries.json?page=1&pageSize=10'),
    );
    expect(r1.status).toBe(200);
    const p1 = await r1.json();
    expect(p1.items).toHaveLength(1);
    expect(p1.meta.nextPage).toBeNull();
    expect(p1.license.editorial.name).toBe('CC BY 4.0');

    const c = await import('../export/entries.csv/route');
    const r2 = await c.GET(
      req('/api/v1/export/entries.csv?page=1&pageSize=10'),
    );
    expect(r2.status).toBe(200);
    expect(r2.headers.get('content-type')).toContain('text/csv');
    const body = await r2.text();
    const lines = body.trim().split('\n');
    expect(lines[0]).toContain('citation_license_url');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('NIST CSRC');
  });

  it('csp-report accepts and never echoes', async () => {
    const { POST, GET } = await import('../csp-report/route');
    const res = await POST(
      new Request('http://localhost:3000/api/v1/csp-report', {
        method: 'POST',
        body: JSON.stringify({
          'csp-report': {
            'document-uri': 'https://synac.app/x',
            'blocked-uri': 'https://evil',
          },
        }),
      }),
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(GET().status).toBe(405);
  });

  it('internal revalidate is closed without a secret', async () => {
    const { POST } = await import('../internal/revalidate/route');
    const res = await POST(
      new Request('http://localhost:3000/api/v1/internal/revalidate', {
        method: 'POST',
        headers: { authorization: 'Bearer nope' },
        body: JSON.stringify({ tags: ['entries'] }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
