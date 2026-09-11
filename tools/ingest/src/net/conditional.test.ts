import { bundleFileSchema } from '@synac/content-tools';
import { describe, expect, it } from 'vitest';

import {
  conditionalHeaders,
  documentValidators,
  reusePreviousDocument,
} from './conditional.js';

const URL_A = 'https://example.test/a';
const URL_B = 'https://example.test/b';

const previous = bundleFileSchema.parse({
  schemaVersion: 1,
  source: 'rfc4949',
  generatedAt: '2026-07-01T00:00:00Z',
  adapterVersion: 'test/1.0.0',
  documents: [
    {
      key: 'doc-a',
      url: URL_A,
      contentType: 'text/plain',
      contentSha256: 'a'.repeat(64),
      fetchedAt: '2026-07-01T00:00:00Z',
      etag: 'W/"v1"',
      lastModified: 'Tue, 01 Jul 2026 00:00:00 GMT',
    },
    {
      key: 'doc-b',
      url: URL_B,
      contentType: 'text/plain',
      contentSha256: 'b'.repeat(64),
      fetchedAt: '2026-07-01T00:00:00Z',
    },
  ],
  entries: [
    {
      entryType: 'TERM',
      slug: 'alpha',
      title: 'Alpha',
      updatedAt: '2026-06-01',
      senses: [
        {
          key: 's1',
          definitionMd: 'Alpha means alpha.',
          citation: { documentKey: 'doc-a' },
        },
      ],
    },
    {
      entryType: 'TERM',
      slug: 'beta',
      title: 'Beta',
      updatedAt: '2026-06-01',
      senses: [
        {
          key: 's1',
          definitionMd: 'Beta means beta.',
          citation: { documentKey: 'doc-b' },
        },
      ],
    },
  ],
});

describe('conditionalHeaders', () => {
  it('replays the validators recorded for the same url', () => {
    expect(conditionalHeaders(previous, URL_A, 'test/1.0.0')).toEqual({
      'if-none-match': 'W/"v1"',
      'if-modified-since': 'Tue, 01 Jul 2026 00:00:00 GMT',
    });
  });

  it('sends nothing for an unrecorded url or a url with no validators', () => {
    expect(conditionalHeaders(previous, URL_B, 'test/1.0.0')).toEqual({});
    expect(
      conditionalHeaders(previous, 'https://example.test/c', 'test/1.0.0'),
    ).toEqual({});
    expect(conditionalHeaders(null, URL_A, 'test/1.0.0')).toEqual({});
  });

  it('withholds validators when the adapter version changed, so the source is reparsed', () => {
    expect(conditionalHeaders(previous, URL_A, 'test/2.0.0')).toEqual({});
  });
});

describe('documentValidators', () => {
  it('records only the validators the response actually carried', () => {
    expect(documentValidators({ etag: 'W/"v1"', lastModified: null })).toEqual({
      etag: 'W/"v1"',
    });
    expect(documentValidators({ etag: null, lastModified: null })).toEqual({});
  });
});

describe('reusePreviousDocument', () => {
  it('returns the document for the url and only the entries citing it', () => {
    const reused = reusePreviousDocument(previous, URL_A);
    expect(reused?.document.key).toBe('doc-a');
    expect(reused?.entries.map((entry) => entry.slug)).toEqual(['alpha']);
    // updatedAt is dropped so finalizeBundle re-derives it from the previous bundle.
    expect(reused?.entries[0]).not.toHaveProperty('updatedAt');
  });

  it('returns nothing when the url was never recorded', () => {
    expect(
      reusePreviousDocument(previous, 'https://example.test/c'),
    ).toBeUndefined();
    expect(reusePreviousDocument(null, URL_A)).toBeUndefined();
  });
});
