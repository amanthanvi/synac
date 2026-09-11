import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import {
  makeEntryRow,
  makeSenseRow,
  modules,
  seedDataset,
  stageDataset,
} from './helpers';

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
      tags: [{ slug: 'malware', name: 'Malware', assignedBy: 'EDITORIAL' }],
    });
    expect(page?.entry.senses).toHaveLength(1);
    expect(page?.entry.senses[0]).toMatchObject({
      labelFallback: 'RFC 4949',
      disambiguationNote: null,
    });
    expect(page?.entry.senses[0].attestations).toEqual([]);
    expect(page?.entry.senses[0].citations[0]).toMatchObject({
      sourceSlug: 'rfc4949',
      attributionText: 'RFC 4949, IETF',
      contentMode: 'QUOTED',
      documentSha256: 'a'.repeat(64),
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
    const page = await t.query(api.search.search, {
      query: 'back door',
      page: 1,
      pageSize: 20,
    });
    expect(page.results[0]).toMatchObject({ key: 'TERM:back-door' });
    expect(page).toMatchObject({ total: 1, hasMore: false });
    expect(page.results[0]).not.toHaveProperty('bucket');
    expect(page.results[0]).not.toHaveProperty('score');

    const acronymOnly = await t.query(api.search.search, {
      query: 'ids',
      entryType: 'ACRONYM',
      page: 1,
      pageSize: 20,
    });
    expect(acronymOnly.results[0]).toMatchObject({
      key: 'ACRONYM:ids',
      senseCount: 1,
      senseSummary: 'Intrusion Detection System',
    });

    expect(
      await t.query(api.search.search, { query: 'the', page: 1, pageSize: 20 }),
    ).toEqual({ results: [], total: 0, hasMore: false });
  });

  test('matches expansions and aliases, and keeps snippets free of titles', async () => {
    const t = await seeded();
    const byExpansion = await t.query(api.search.search, {
      query: 'intrusion detection',
      page: 1,
      pageSize: 20,
    });
    expect(byExpansion.results.map((result) => result.key)).toContain(
      'ACRONYM:ids',
    );

    const byAlias = await t.query(api.search.search, {
      query: 'trapdoor',
      page: 1,
      pageSize: 20,
    });
    expect(byAlias.results[0]?.key).toBe('TERM:back-door');
    expect(byAlias.results[0]?.snippet).toBe('A hidden access mechanism.');
  });

  test('consults the full-text index for two-character queries', async () => {
    const t = await seeded();
    const page = await t.query(api.search.search, {
      query: 'monitors',
      page: 1,
      pageSize: 20,
    });
    expect(page.results.map((result) => result.key)).toEqual(['ACRONYM:ids']);
    expect(page.results[0]?.snippet).toBe('Intrusion detection system.');
  });

  test('gathers tag-filtered candidates through the tag index', async () => {
    const t = await seeded();
    const tagged = await t.query(api.search.search, {
      query: 'hidden',
      tagSlug: 'malware',
      page: 1,
      pageSize: 20,
    });
    expect(tagged.results.map((result) => result.key)).toEqual([
      'TERM:back-door',
    ]);
    expect(
      await t.query(api.search.search, {
        query: 'hidden',
        tagSlug: 'nonexistent',
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({ results: [], total: 0, hasMore: false });
  });

  test('senses search returns anchors, sources, and highlighted snippets', async () => {
    const t = await seeded();
    const page = await t.query(api.search.senses, {
      query: 'bypasses',
      page: 1,
      pageSize: 20,
    });
    expect(page.total).toBe(1);
    expect(page.results[0]).toEqual({
      entryType: 'TERM',
      slug: 'back-door',
      title: 'Back Door',
      senseKey: 'rfc4949:back-door',
      anchor: 'sense-rfc4949-back-door',
      label: null,
      expandedForm: null,
      labelFallback: 'RFC 4949',
      sourceNames: ['RFC 4949'],
      snippet: 'A hidden mechanism that <<bypasses>> authentication.',
    });
  });
});

describe('tags and sources', () => {
  test('tag directory, tag entries, source detail, and cited entries', async () => {
    const t = await seeded();
    const directory = await t.query(api.tags.directory, {});
    expect(directory).toEqual([
      {
        slug: 'malware',
        name: 'Malware',
        description: null,
        entryCount: 1,
        editorialCount: 1,
        autoCount: 0,
      },
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
    expect(source).toMatchObject({
      slug: 'rfc4949',
      citedEntryCount: 2,
      contentMode: 'QUOTED',
      publicStatement: null,
    });

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
        snippetText: `Tagged definition ${index}.`,
        senses: [
          makeSenseRow({
            key: `test:tagged-${index}`,
            normalizedLabel: `tagged ${index}`,
            definitionMd: `Tagged definition ${index}.`,
            definitionText: `Tagged definition ${index}.`,
            attestations: [],
            citations: [],
          }),
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

describe('rateLimit', () => {
  // Spending a token needs the rate limiter component, which convex-test does
  // not mount; both guards reject before the handler reaches it.
  test('rejects a wrong service key and an unhashed bucket key', async () => {
    process.env.SYNAC_CONVEX_SERVICE_KEY = 'test-service-key';
    const t = await seeded();
    const args = {
      serviceKey: 'test-service-key',
      scope: 'api_v1_search' as const,
      key: `ip:${'a'.repeat(64)}`,
    };
    await expect(
      t.mutation(api.rateLimit.consume, { ...args, serviceKey: 'wrong' }),
    ).rejects.toThrow(/Unauthorized/);
    await expect(
      t.mutation(api.rateLimit.consume, { ...args, key: 'session:anything' }),
    ).rejects.toThrow(/Invalid rate limit key/);
    await expect(
      t.mutation(api.rateLimit.consume, { ...args, key: 'ip:not-a-digest' }),
    ).rejects.toThrow(/Invalid rate limit key/);
  });
});
