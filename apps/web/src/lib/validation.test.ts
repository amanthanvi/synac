import '../test.setup';

import { describe, expect, it } from 'vitest';

import type { JsonPayload } from './apiErrors';

import {
  createEntryBodySchema,
  createIngestRunBodySchema,
  createSourceBodySchema,
  createTagBodySchema,
  entryRollbackSnapshotSchema,
  mergeTagBodySchema,
  parseBody,
  patchEntryBodySchema,
  proposedChangeSchema,
  rejectIngestItemBodySchema,
  sourceLocatorSchema,
} from './validation';

const VALID_UUID = '11111111-2222-4333-8444-555555555555';

/** A raw string is sent verbatim, so a test can post a deliberately broken body. */
function jsonRequest(
  body: JsonPayload | string,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost:3000/api/v1/admin/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('parseBody', () => {
  it('returns typed data for a valid body', async () => {
    const result = await parseBody(
      jsonRequest({ entryType: 'TERM', displayTitle: '  Phishing  ' }),
      createEntryBodySchema,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.displayTitle).toBe('Phishing');
      expect(result.data.entryType).toBe('TERM');
    }
  });

  it('rejects a schema violation with 400 invalid_body and the issue list', async () => {
    const result = await parseBody(
      jsonRequest(
        { entryType: 'SOMETHING_ELSE', displayTitle: '' },
        { 'x-request-id': 'req-7' },
      ),
      createEntryBodySchema,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(400);
    const payload = await result.response.json();
    expect(payload.error).toBe('invalid_body');
    expect(payload.requestId).toBe('req-7');
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(payload.issues.length).toBeGreaterThan(0);
  });

  it('rejects malformed JSON with the same shape as a schema failure', async () => {
    const result = await parseBody(
      jsonRequest('{not json'),
      createEntryBodySchema,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error).toBe('invalid_body');
  });

  it('treats an empty body as `{}` so schemas with defaults still apply', async () => {
    const request = new Request(
      'http://localhost:3000/api/v1/admin/ingest/runs',
      {
        method: 'POST',
      },
    );

    const result = await parseBody(request, createIngestRunBodySchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.maxItems).toBe(100);
      expect(result.data.forceReprocess).toBe(false);
    }
  });
});

describe('entry schemas', () => {
  it('defaults the optional patch fields to empty strings', () => {
    const parsed = patchEntryBodySchema.parse({ displayTitle: 'Phishing' });
    expect(parsed).toEqual({
      displayTitle: 'Phishing',
      primarySlug: '',
      summaryMd: '',
      editorialNotes: '',
    });
  });

  it('rejects a blank display title', () => {
    expect(
      patchEntryBodySchema.safeParse({ displayTitle: '   ' }).success,
    ).toBe(false);
  });

  it('collapses a blank optional slug to undefined', () => {
    expect(
      createEntryBodySchema.parse({
        entryType: 'ACRONYM',
        displayTitle: 'SAML',
        primarySlug: '  ',
      }).primarySlug,
    ).toBeUndefined();
  });
});

describe('tag and source schemas', () => {
  it('requires a uuid for a merge target', () => {
    expect(
      mergeTagBodySchema.safeParse({ intoTagId: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(
      mergeTagBodySchema.safeParse({ intoTagId: VALID_UUID }).success,
    ).toBe(true);
  });

  it('accepts an optional tag kind and parent', () => {
    const parsed = createTagBodySchema.parse({
      name: 'Identity',
      kind: 'FACET',
      parentId: VALID_UUID,
    });
    expect(parsed.kind).toBe('FACET');
    expect(parsed.parentId).toBe(VALID_UUID);
  });

  it('rejects an unknown licence type and a non-URL base url', () => {
    const base = {
      name: 'NIST',
      sourceSlug: 'nist',
      baseUrl: 'https://csrc.nist.gov',
      licenseType: 'PUBLIC_DOMAIN',
      allowedUse: 'Public domain',
      attributionRequirements: 'Cite NIST',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
    };

    expect(createSourceBodySchema.safeParse(base).success).toBe(true);
    expect(
      createSourceBodySchema.safeParse({ ...base, licenseType: 'MADE_UP' })
        .success,
    ).toBe(false);
    expect(
      createSourceBodySchema.safeParse({ ...base, baseUrl: 'not a url' })
        .success,
    ).toBe(false);
  });

  it('requires lastVerifiedAt to be a plain date when present', () => {
    const base = {
      name: 'NIST',
      sourceSlug: 'nist',
      baseUrl: 'https://csrc.nist.gov',
      licenseType: 'PUBLIC_DOMAIN',
      allowedUse: 'Public domain',
      attributionRequirements: 'Cite NIST',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
    };

    expect(
      createSourceBodySchema.safeParse({
        ...base,
        lastVerifiedAt: '2026-03-24',
      }).success,
    ).toBe(true);
    expect(
      createSourceBodySchema.safeParse({
        ...base,
        lastVerifiedAt: '24/03/2026',
      }).success,
    ).toBe(false);
  });
});

describe('ingest schemas', () => {
  it('requires a non-empty rejection reason', () => {
    expect(
      rejectIngestItemBodySchema.safeParse({ reason: '   ' }).success,
    ).toBe(false);
    expect(
      rejectIngestItemBodySchema.safeParse({ reason: 'Out of scope' }).success,
    ).toBe(true);
  });

  it('clamps maxItems to the allowed range', () => {
    expect(createIngestRunBodySchema.safeParse({ maxItems: 0 }).success).toBe(
      false,
    );
    expect(
      createIngestRunBodySchema.safeParse({ maxItems: 5000 }).success,
    ).toBe(false);
    expect(createIngestRunBodySchema.parse({ maxItems: 50 }).maxItems).toBe(50);
  });

  it('accepts a CREATE_ENTRY proposal and rejects one with no senses', () => {
    const ok = proposedChangeSchema.safeParse({
      kind: 'CREATE_ENTRY',
      entryType: 'TERM',
      displayTitle: 'Phishing',
      summaryMd: 'A social-engineering attack.',
      senses: [
        { definitionMd: 'Tricking a person into revealing credentials.' },
      ],
    });
    expect(ok.success).toBe(true);

    expect(
      proposedChangeSchema.safeParse({
        kind: 'CREATE_ENTRY',
        entryType: 'TERM',
        displayTitle: 'Phishing',
        senses: [],
      }).success,
    ).toBe(false);
  });

  it('requires a uuid entryId for ADD_SENSES', () => {
    const build = (entryId: string) => ({
      kind: 'ADD_SENSES' as const,
      entryId,
      entryType: 'TERM' as const,
      displayTitle: 'Phishing',
      senses: [{ definitionMd: 'Another attested meaning.' }],
    });

    expect(proposedChangeSchema.safeParse(build('')).success).toBe(false);
    expect(proposedChangeSchema.safeParse(build(VALID_UUID)).success).toBe(
      true,
    );
  });

  it('rejects an unknown proposal kind', () => {
    expect(
      proposedChangeSchema.safeParse({ kind: 'DELETE_EVERYTHING' }).success,
    ).toBe(false);
  });

  it('bounds sourceLocator fields', () => {
    expect(
      sourceLocatorSchema.safeParse({
        page: 12,
        selector: 'main > p:nth-child(2)',
      }).success,
    ).toBe(true);
    expect(
      sourceLocatorSchema.safeParse({ quote: 'x'.repeat(5000) }).success,
    ).toBe(false);
    expect(sourceLocatorSchema.safeParse('not an object').success).toBe(false);
  });
});

describe('entryRollbackSnapshotSchema', () => {
  it('accepts a snapshot with a known status', () => {
    const parsed = entryRollbackSnapshotSchema.parse({
      displayTitle: 'Phishing',
      primarySlug: 'phishing',
      status: 'PUBLISHED',
      publishedAt: '2026-03-24T00:00:00.000Z',
    });
    expect(parsed.status).toBe('PUBLISHED');
  });

  it('rejects a status outside the enum', () => {
    const result = entryRollbackSnapshotSchema.safeParse({
      status: 'SUPERPUBLISHED',
    });
    expect(result.success).toBe(false);
  });

  it('tolerates extra keys from older snapshots', () => {
    const result = entryRollbackSnapshotSchema.safeParse({
      displayTitle: 'Phishing',
      somethingRemovedLongAgo: 42,
    });
    expect(result.success).toBe(true);
  });
});
