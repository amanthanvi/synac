import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { modules, seedDataset } from './helpers';

async function seeded() {
  const t = convexTest(schema, modules);
  await seedDataset(t);
  return t;
}

describe('publicEntries', () => {
  test('resolveBySlug finds canonical entries, redirects, and cross-type hits', async () => {
    const t = await seeded();
    expect(await t.query(api.publicEntries.resolveBySlug, { entryType: 'TERM', slug: 'back-door' })).toEqual({
      entryType: 'TERM',
      canonicalSlug: 'back-door',
      needsRedirect: false,
    });
    expect(await t.query(api.publicEntries.resolveBySlug, { entryType: 'TERM', slug: 'backdoor-old' })).toEqual({
      entryType: 'TERM',
      canonicalSlug: 'back-door',
      needsRedirect: true,
    });
    expect(await t.query(api.publicEntries.resolveBySlug, { entryType: 'TERM', slug: 'ids' })).toEqual({
      entryType: 'ACRONYM',
      canonicalSlug: 'ids',
      needsRedirect: true,
    });
    expect(await t.query(api.publicEntries.resolveBySlug, { entryType: 'TERM', slug: 'nope' })).toBeNull();
  });

  test('getEntryPage returns senses, citations, tags, and relationships', async () => {
    const t = await seeded();
    const page = await t.query(api.publicEntries.getEntryPage, { entryType: 'TERM', slug: 'back-door' });
    expect(page?.entry).toMatchObject({
      key: 'TERM:back-door',
      title: 'Back Door',
      aliases: ['trapdoor'],
      tags: [{ slug: 'malware', name: 'Malware' }],
    });
    expect(page?.entry.senses).toHaveLength(1);
    expect(page?.entry.senses[0].citations[0]).toMatchObject({
      sourceSlug: 'rfc4949',
      attributionText: 'RFC 4949, IETF',
    });
    expect(page?.relationships).toEqual([
      {
        type: 'RELATED',
        entry: {
          key: 'ACRONYM:ids',
          entryType: 'ACRONYM',
          slug: 'ids',
          title: 'IDS',
          summaryText: 'Intrusion detection system.',
        },
      },
    ]);
  });

  test('listRecent orders by updatedAt desc and paginates', async () => {
    const t = await seeded();
    const page = await t.query(api.publicEntries.listRecent, { page: 1, pageSize: 1 });
    expect(page.entries).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });
});

describe('publicBrowse', () => {
  test('filters by letter, in-page query, and tag', async () => {
    const t = await seeded();
    const byLetter = await t.query(api.publicBrowse.browse, {
      entryType: 'TERM',
      letter: 'b',
      page: 1,
      pageSize: 20,
      sort: 'title',
      query: '',
      tagSlug: null,
    });
    expect(byLetter.entries.map((e) => e.slug)).toEqual(['back-door']);
    expect(byLetter.tags.map((tag) => tag.slug)).toEqual(['malware']);

    const filtered = await t.query(api.publicBrowse.browse, {
      entryType: 'TERM',
      letter: 'b',
      page: 1,
      pageSize: 20,
      sort: 'title',
      query: 'trapdoor',
      tagSlug: null,
    });
    expect(filtered.entries).toHaveLength(1);

    const wrongTag = await t.query(api.publicBrowse.browse, {
      entryType: 'TERM',
      letter: 'b',
      page: 1,
      pageSize: 20,
      sort: 'title',
      query: '',
      tagSlug: 'nonexistent',
    });
    expect(wrongTag.activeTag).toBeNull();
  });
});

describe('search', () => {
  test('ranks exact title matches first and filters by type', async () => {
    const t = await seeded();
    const results = await t.query(api.search.search, {
      query: 'back door',
      page: 1,
      pageSize: 20,
    });
    expect(results[0]).toMatchObject({ key: 'TERM:back-door', bucket: 1 });

    const acronymOnly = await t.query(api.search.search, {
      query: 'ids',
      entryType: 'ACRONYM',
      page: 1,
      pageSize: 20,
    });
    expect(acronymOnly[0]).toMatchObject({ key: 'ACRONYM:ids', senseSummary: 'Intrusion Detection System' });

    expect(await t.query(api.search.search, { query: 'the', page: 1, pageSize: 20 })).toEqual([]);
  });
});

describe('tags and sources', () => {
  test('tag directory, tag entries, source detail, and cited entries', async () => {
    const t = await seeded();
    const directory = await t.query(api.tags.directory, {});
    expect(directory).toEqual([{ slug: 'malware', name: 'Malware', description: null, entryCount: 1 }]);

    const tagEntries = await t.query(api.tags.entriesForTag, { tagSlug: 'malware', page: 1, pageSize: 20 });
    expect(tagEntries.entries.map((e) => e.key)).toEqual(['TERM:back-door']);

    const source = await t.query(api.sources.bySlug, { slug: 'rfc4949' });
    expect(source).toMatchObject({ slug: 'rfc4949', citedEntryCount: 1 });

    const cited = await t.query(api.sources.citedEntries, { sourceSlug: 'rfc4949', page: 1, pageSize: 20 });
    expect(cited.entries.map((e) => e.key)).toEqual(['TERM:back-door', 'ACRONYM:ids']);
  });
});

describe('views', () => {
  test('trackView requires the service key and dedupes within the window', async () => {
    process.env.SYNAC_CONVEX_SERVICE_KEY = 'test-service-key';
    const t = await seeded();
    const args = {
      serviceKey: 'test-service-key',
      entryKey: 'TERM:back-door',
      sessionHash: 'a'.repeat(32),
    };
    await expect(
      t.mutation(api.views.trackView, { ...args, serviceKey: 'wrong' }),
    ).rejects.toThrow(/Unauthorized/);

    expect(await t.mutation(api.views.trackView, args)).toEqual({ counted: true });
    expect(await t.mutation(api.views.trackView, args)).toEqual({ counted: false });
    expect(
      await t.mutation(api.views.trackView, { ...args, entryKey: 'TERM:unknown' }),
    ).toEqual({ counted: false });
  });
});
