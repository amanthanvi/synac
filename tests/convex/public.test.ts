import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { makeEntryRow, modules, seedDataset, stageDataset } from './helpers';

async function seeded() {
  const t = convexTest(schema, modules);
  await seedDataset(t);
  return t;
}

describe('publicEntries', () => {
  test('legacy sitemap callers may omit the generation argument', async () => {
    const t = await seeded();
    const page = await t.query(api.sitemap.entrySlugsPage, {
      entryType: 'TERM',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page).toMatchObject({
      contentVersion: 'v1',
      generationChanged: false,
      page: [{ slug: 'back-door' }],
    });
  });

  test('resolveBySlug finds canonical entries, redirects, and cross-type hits', async () => {
    const t = await seeded();
    expect(
      await t.query(api.publicEntries.resolveBySlug, {
        entryType: 'TERM',
        slug: 'back-door',
      }),
    ).toEqual({
      entryType: 'TERM',
      canonicalSlug: 'back-door',
      needsRedirect: false,
    });
    expect(
      await t.query(api.publicEntries.resolveBySlug, {
        entryType: 'TERM',
        slug: 'backdoor-old',
      }),
    ).toEqual({
      entryType: 'TERM',
      canonicalSlug: 'back-door',
      needsRedirect: true,
    });
    expect(
      await t.query(api.publicEntries.resolveBySlug, {
        entryType: 'TERM',
        slug: 'ids',
      }),
    ).toEqual({
      entryType: 'ACRONYM',
      canonicalSlug: 'ids',
      needsRedirect: true,
    });
    expect(
      await t.query(api.publicEntries.resolveBySlug, {
        entryType: 'TERM',
        slug: 'nope',
      }),
    ).toBeNull();
  });

  test('getEntryPage returns senses, citations, tags, and relationships', async () => {
    const t = await seeded();
    const page = await t.query(api.publicEntries.getEntryPage, {
      entryType: 'TERM',
      slug: ' BACK-DOOR ',
    });
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
    const page = await t.query(api.publicEntries.listRecent, {
      page: 1,
      pageSize: 1,
    });
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
    expect(acronymOnly[0]).toMatchObject({
      key: 'ACRONYM:ids',
      senseSummary: 'Intrusion Detection System',
    });

    expect(
      await t.query(api.search.search, { query: 'the', page: 1, pageSize: 20 }),
    ).toEqual([]);
  });
});

describe('tags and sources', () => {
  test('tag directory, tag entries, source detail, and cited entries', async () => {
    const t = await seeded();
    const directory = await t.query(api.tags.directory, {});
    expect(directory).toEqual([
      { slug: 'malware', name: 'Malware', description: null, entryCount: 1 },
    ]);

    const tagEntries = await t.query(api.tags.entriesForTag, {
      tagSlug: ' MALWARE ',
      page: 1,
      pageSize: 20,
    });
    expect(tagEntries.entries.map((e) => e.key)).toEqual(['TERM:back-door']);
    expect(await t.query(api.tags.resolveSlug, { slug: 'malware' })).toEqual({
      kind: 'CANONICAL',
      slug: 'malware',
    });
    expect(
      await t.query(api.tags.resolveSlug, { slug: 'old-malware' }),
    ).toEqual({
      kind: 'REDIRECT',
      slug: 'malware',
    });
    expect(await t.query(api.tags.resolveSlug, { slug: 'protocols' })).toEqual({
      kind: 'RETIRED',
      slug: 'protocols',
    });

    const source = await t.query(api.sources.bySlug, { slug: 'rfc4949' });
    expect(source).toMatchObject({ slug: 'rfc4949', citedEntryCount: 2 });

    const cited = await t.query(api.sources.citedEntries, {
      sourceSlug: ' RFC4949 ',
      page: 1,
      pageSize: 20,
    });
    expect(cited.entries.map((e) => e.key)).toEqual([
      'TERM:back-door',
      'ACRONYM:ids',
    ]);
  });

  test('tag pagination reaches pages beyond ten and uses the type index', async () => {
    const t = await seeded();
    const entries = Array.from({ length: 11 }, (_, index) =>
      makeEntryRow({
        key: `TERM:tagged-${index}`,
        slug: `tagged-${index}`,
        title: `Tagged ${index}`,
        normalizedTitle: `tagged ${index}`,
        updatedAt: Date.parse('2026-07-02T00:00:00Z') + index,
        searchDocument: `tagged ${index}`,
        senses: [
          {
            key: `test:tagged-${index}`,
            order: 0,
            definitionMd: `Tagged definition ${index}.`,
            definitionText: `Tagged definition ${index}.`,
            isEditorial: false,
            isPreferred: true,
            examples: [],
            citations: [],
          },
        ],
      }),
    );
    await stageDataset(t, 'v2', {
      tags: [{ slug: 'malware', name: 'Malware', entryCount: 11 }],
      sources: [
        {
          slug: 'rfc4949',
          name: 'RFC 4949',
          baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          licenseType: 'OTHER',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'RFC 4949, IETF',
          trustTier: 'TIER1',
          enabled: true,
          lastVerifiedAt: Date.parse('2026-01-15T00:00:00Z'),
          citedEntryCount: 11,
        },
      ],
      entries,
      relationships: [],
      redirects: [],
      tagRedirects: [],
    });
    const pageTen = await t.query(api.tags.entriesForTag, {
      tagSlug: 'malware',
      entryType: 'TERM',
      page: 10,
      pageSize: 1,
    });
    const pageEleven = await t.query(api.tags.entriesForTag, {
      tagSlug: 'malware',
      entryType: 'TERM',
      page: 11,
      pageSize: 1,
    });
    expect(pageTen.entries).toHaveLength(1);
    expect(pageEleven.entries).toHaveLength(1);
    expect(pageEleven.entries[0].key).not.toBe(pageTen.entries[0].key);
    expect(
      await t.query(api.tags.entriesForTag, {
        tagSlug: 'malware',
        entryType: 'TERM',
        page: 101,
        pageSize: 1,
      }),
    ).toEqual({ entries: [], hasMore: false });
  });

  test('legacy active links without entryType remain type-filterable during migration', async () => {
    const t = await seeded();
    await t.run(async (ctx) => {
      const meta = await ctx.db
        .query('syncMeta')
        .withIndex('by_key', (q) => q.eq('key', 'content'))
        .unique();
      const link = await ctx.db
        .query('entryTags')
        .withIndex('by_syncVersion_and_entryKey_and_tagSlug', (q) =>
          q
            .eq('syncVersion', 'v1')
            .eq('entryKey', 'TERM:back-door')
            .eq('tagSlug', 'malware'),
        )
        .unique();
      if (!meta || !link) throw new Error('legacy fixture rows missing');
      await ctx.db.patch(meta._id, { formatVersion: undefined });
      await ctx.db.patch(link._id, { entryType: undefined });
    });
    const result = await t.query(api.tags.entriesForTag, {
      tagSlug: 'malware',
      entryType: 'TERM',
      page: 1,
      pageSize: 20,
    });
    expect(result.entries.map((entry) => entry.key)).toEqual([
      'TERM:back-door',
    ]);
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

    expect(await t.mutation(api.views.trackView, args)).toEqual({
      counted: true,
    });
    expect(await t.mutation(api.views.trackView, args)).toEqual({
      counted: false,
    });
    expect(
      await t.mutation(api.views.trackView, {
        ...args,
        entryKey: 'TERM:unknown',
      }),
    ).toEqual({ counted: false });
  });
});
