import '../../../../../test.setup';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { resetLocalRateLimitWindows } from '@/lib/rateLimit';

import {
  createPublishedEntryWithCitation,
  createSourceBundle,
} from '../../_shared/fixtures';
import { GET, OPTIONS } from './route';

const prisma = createIntegrationTestClient();

function request(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000/api/v1/entries/by-slug${query}`, {
    headers,
  });
}

describe('GET /api/v1/entries/by-slug', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    resetLocalRateLimitWindows();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns the entry with per-sense citations and licence terms', async () => {
    const { citationId } = await createSourceBundle(prisma);
    await createPublishedEntryWithCitation(prisma, {
      slug: 'phishing',
      title: 'Phishing',
      senseLabel: 'Credential theft',
      senseSlug: 'credential-theft',
      citationId,
      tagSlug: 'social-engineering',
    });

    const response = await GET(request('?type=TERM&slug=phishing'));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.entry.slug).toBe('phishing');
    expect(payload.entry.url).toBe('/term/phishing');
    expect(payload.entry.tags[0].assignedBy).toBe('EDITORIAL');

    const sense = payload.entry.senses[0];
    expect(sense.url).toBe('/term/phishing#s-credential-theft');
    expect(sense.citationRecordUrl).toBe(
      `/api/v1/senses/${sense.id}/citation.json`,
    );

    // A definition never travels without the terms that permit its reuse.
    const citation = sense.citations[0];
    expect(citation.contentMode).toBe('QUOTED');
    expect(citation.source.name).toBe('NIST CSRC');
    expect(citation.source.licenseStatement).toBe(
      'US Government work, public domain.',
    );
    expect(citation.source.attributionRequirements).toBe('Cite NIST CSRC.');
    expect(citation.document.contentSha256).toHaveLength(64);

    expect(payload.entry.license.editorial.name).toBe('CC BY 4.0');
    expect(payload.entry.license.attestations.statement).toContain(
      'own source',
    );
  });

  it('sets the public cache, CORS, and Vary headers', async () => {
    const { citationId } = await createSourceBundle(prisma);
    await createPublishedEntryWithCitation(prisma, {
      slug: 'phishing',
      title: 'Phishing',
      citationId,
    });

    const response = await GET(request('?type=TERM&slug=phishing'));

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{40}"$/);
    expect(response.headers.get('x-ratelimit-limit')).toBe('120');
  });

  it('answers 304 when the caller already has the current ETag', async () => {
    const { citationId } = await createSourceBundle(prisma);
    await createPublishedEntryWithCitation(prisma, {
      slug: 'phishing',
      title: 'Phishing',
      citationId,
    });

    const first = await GET(request('?type=TERM&slug=phishing'));
    const etag = first.headers.get('etag') ?? '';
    expect(etag).toBeTruthy();

    const second = await GET(
      request('?type=TERM&slug=phishing', { 'if-none-match': etag }),
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');

    const stale = await GET(
      request('?type=TERM&slug=phishing', { 'if-none-match': '"nope"' }),
    );
    expect(stale.status).toBe(200);
  });

  it('resolves a historic slug to the entry that now owns it', async () => {
    const { citationId } = await createSourceBundle(prisma);
    const { entryId } = await createPublishedEntryWithCitation(prisma, {
      slug: 'phishing',
      title: 'Phishing',
      citationId,
    });

    await prisma.entrySlugHistory.create({
      data: { entryId, entryType: 'TERM', slug: 'fishing' },
    });

    const response = await GET(request('?type=TERM&slug=fishing'));
    expect(response.status).toBe(200);
    expect((await response.json()).entry.slug).toBe('phishing');
  });

  it('404s an unpublished entry', async () => {
    const { citationId } = await createSourceBundle(prisma);
    const { entryId } = await createPublishedEntryWithCitation(prisma, {
      slug: 'draft-only',
      title: 'Draft Only',
      citationId,
    });
    await prisma.entry.update({
      where: { id: entryId },
      data: { status: 'DRAFT' },
    });

    const response = await GET(request('?type=TERM&slug=draft-only'));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('not_found');
  });

  it('400s a malformed type or a missing slug', async () => {
    expect((await GET(request('?type=WIDGET&slug=phishing'))).status).toBe(400);
    expect((await GET(request('?type=TERM'))).status).toBe(400);
  });

  it('answers a CORS preflight', async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'GET',
    );
  });
});
