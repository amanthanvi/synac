import '../../../../test.setup';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { resetLocalRateLimitWindows } from '@/lib/rateLimit';

import {
  createPublishedEntryWithCitation,
  createSourceBundle,
} from '../_shared/fixtures';
import { GET, OPTIONS } from './route';

const prisma = createIntegrationTestClient();

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/v1/tags', { headers });
}

describe('GET /api/v1/tags', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    resetLocalRateLimitWindows();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns an empty list rather than failing when nothing is tagged', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toEqual([]);
    expect(payload.meta.total).toBe(0);
  });

  it('counts only published entries against each tag', async () => {
    const { citationId } = await createSourceBundle(prisma);

    await createPublishedEntryWithCitation(prisma, {
      slug: 'phishing',
      title: 'Phishing',
      citationId,
      tagSlug: 'social-engineering',
    });
    const draft = await createPublishedEntryWithCitation(prisma, {
      slug: 'vishing',
      title: 'Vishing',
      citationId,
      tagSlug: 'social-engineering',
    });
    await prisma.entry.update({
      where: { id: draft.entryId },
      data: { status: 'DRAFT' },
    });

    // A tag nothing published carries still appears, with a count of zero.
    await prisma.tag.create({ data: { name: 'Empty', slug: 'empty' } });

    const payload = await (await GET(request())).json();

    const byslug = new Map(
      payload.items.map((tag: { slug: string; publishedCount: number }) => [
        tag.slug,
        tag.publishedCount,
      ]),
    );
    expect(byslug.get('social-engineering')).toBe(1);
    expect(byslug.get('empty')).toBe(0);
  });

  it('excludes soft-deleted tags', async () => {
    await prisma.tag.create({
      data: { name: 'Gone', slug: 'gone', deletedAt: new Date() },
    });
    await prisma.tag.create({ data: { name: 'Here', slug: 'here' } });

    const payload = await (await GET(request())).json();
    const slugs = payload.items.map((tag: { slug: string }) => tag.slug);

    expect(slugs).toContain('here');
    expect(slugs).not.toContain('gone');
  });

  it('exposes kind, parent, and the public URL', async () => {
    const parent = await prisma.tag.create({
      data: { name: 'Identity', slug: 'identity', kind: 'DOMAIN' },
      select: { id: true },
    });
    await prisma.tag.create({
      data: { name: 'MFA', slug: 'mfa', kind: 'FACET', parentId: parent.id },
    });

    const payload = await (await GET(request())).json();
    const mfa = payload.items.find(
      (tag: { slug: string }) => tag.slug === 'mfa',
    );

    expect(mfa.kind).toBe('FACET');
    expect(mfa.parentId).toBe(parent.id);
    expect(mfa.url).toBe('/tags/mfa');
  });

  it('sets the public cache headers, an ETag, and CORS', async () => {
    await prisma.tag.create({ data: { name: 'Here', slug: 'here' } });

    const response = await GET(request());
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');

    const etag = response.headers.get('etag') ?? '';
    const conditional = await GET(request({ 'if-none-match': etag }));
    expect(conditional.status).toBe(304);
  });

  it('answers a CORS preflight', () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
