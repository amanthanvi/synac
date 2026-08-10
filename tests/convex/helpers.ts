/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { internal } from '../../convex/_generated/api';
import { syncPayloadHash } from '../../tools/content/src/sync-plan';

export const modules = import.meta.glob('../../convex/**/*.ts');

export function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    key: 'TERM:back-door',
    entryType: 'TERM' as const,
    slug: 'back-door',
    title: 'Back Door',
    normalizedTitle: 'back door',
    aliases: ['trapdoor'],
    summaryText: 'A hidden access mechanism.',
    updatedAt: Date.parse('2026-07-01T00:00:00Z'),
    senseCount: 1,
    searchDocument:
      'Back Door back door back-door trapdoor a hidden mechanism that bypasses authentication',
    tagSlugs: ['malware'],
    citedSourceSlugs: ['rfc4949'],
    senses: [
      {
        key: 'rfc4949:back-door',
        order: 0,
        definitionMd: 'A **hidden** mechanism that bypasses authentication.',
        definitionText: 'A hidden mechanism that bypasses authentication.',
        isEditorial: false,
        isPreferred: true,
        examples: [],
        citations: [
          {
            sourceSlug: 'rfc4949',
            sourceName: 'RFC 4949',
            url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
            attributionText: 'RFC 4949, IETF',
            accessedAt: Date.parse('2026-07-01T00:00:00Z'),
          },
        ],
      },
    ],
    ...overrides,
  };
}

export type SeedDatasetOptions = {
  tags?: Array<{ slug: string; name: string; entryCount: number }>;
  sources?: Array<{
    slug: string;
    name: string;
    baseUrl: string;
    licenseType: string;
    allowedUse: string;
    attributionRequirements: string;
    trustTier: string;
    enabled: boolean;
    lastVerifiedAt: number;
    citedEntryCount: number;
  }>;
  entries?: Array<ReturnType<typeof makeEntryRow>>;
  relationships?: Array<{
    fromKey: string;
    toKey: string;
    type: 'RELATED' | 'SEE_ALSO' | 'CONTRAST';
  }>;
  redirects?: Array<{
    entryType: 'TERM' | 'ACRONYM';
    fromSlug: string;
    toSlug: string;
  }>;
  tagRedirects?: Array<{ fromSlug: string; toSlug?: string }>;
  stageBatchCount?: number;
  commit?: boolean;
};

export async function stageDataset(
  t: ReturnType<typeof convexTest>,
  syncVersion = 'v1',
  options: SeedDatasetOptions = {},
) {
  const tags = options.tags ?? [
    { slug: 'malware', name: 'Malware', entryCount: 1 },
  ];
  const sources = options.sources ?? [
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
      citedEntryCount: 2,
    },
  ];
  const entries = options.entries ?? [
    makeEntryRow(),
    makeEntryRow({
      key: 'ACRONYM:ids',
      entryType: 'ACRONYM' as const,
      slug: 'ids',
      title: 'IDS',
      normalizedTitle: 'ids',
      aliases: [],
      summaryText: 'Intrusion detection system.',
      senseSummary: 'Intrusion Detection System',
      searchDocument:
        'IDS ids intrusion detection system monitors network traffic',
      tagSlugs: [],
      citedSourceSlugs: ['rfc4949'],
      senses: [
        {
          key: 'rfc4949:ids',
          order: 0,
          definitionMd: 'A system that monitors for intrusions.',
          definitionText: 'A system that monitors for intrusions.',
          expandedForm: 'Intrusion Detection System',
          isEditorial: false,
          isPreferred: true,
          examples: [],
          citations: [],
        },
      ],
    }),
  ];
  const relationships = options.relationships ?? [
    {
      fromKey: 'TERM:back-door',
      toKey: 'ACRONYM:ids',
      type: 'RELATED' as const,
    },
  ];
  const redirects = options.redirects ?? [
    {
      entryType: 'TERM' as const,
      fromSlug: 'backdoor-old',
      toSlug: 'back-door',
    },
  ];
  const tagRedirects = options.tagRedirects ?? [
    { fromSlug: 'old-malware', toSlug: 'malware' },
    { fromSlug: 'protocols' },
  ];
  const expectedCounts = {
    sources: sources.length,
    tags: tags.length,
    entries: entries.length,
    senses: entries.reduce((total, entry) => total + entry.senses.length, 0),
    entryTags: entries.reduce(
      (total, entry) => total + entry.tagSlugs.length,
      0,
    ),
    entrySources: entries.reduce(
      (total, entry) => total + entry.citedSourceSlugs.length,
      0,
    ),
    relationships: relationships.length,
    redirects: redirects.length,
    tagRedirects: tagRedirects.length,
  };
  const expectedTagCounts = Object.fromEntries(
    tags.map((tag) => [tag.slug, tag.entryCount]),
  );
  const expectedSourceCounts = Object.fromEntries(
    sources.map((source) => [source.slug, source.citedEntryCount]),
  );
  type BatchIdentity = {
    syncVersion: string;
    manifestHash: string;
    ordinal: number;
    batchHash: string;
  };
  const batches = [
    {
      kind: 'sources',
      rows: sources,
      run: async (identity: BatchIdentity) =>
        await t.mutation(internal.sync.upsertSources, {
          ...identity,
          rows: sources,
        }),
    },
    {
      kind: 'tags',
      rows: tags,
      run: async (identity: BatchIdentity) =>
        await t.mutation(internal.sync.upsertTags, { ...identity, rows: tags }),
    },
    {
      kind: 'entries',
      rows: entries,
      run: async (identity: BatchIdentity) =>
        await t.mutation(internal.sync.upsertEntries, {
          ...identity,
          rows: entries,
        }),
    },
    {
      kind: 'relationships',
      rows: relationships,
      run: async (identity: BatchIdentity) =>
        await t.mutation(internal.sync.upsertRelationships, {
          ...identity,
          rows: relationships,
        }),
    },
    {
      kind: 'redirects',
      rows: redirects,
      run: async (identity: BatchIdentity) =>
        await t.mutation(internal.sync.upsertRedirects, {
          ...identity,
          rows: redirects,
        }),
    },
    {
      kind: 'tagRedirects',
      rows: tagRedirects,
      run: async (identity: BatchIdentity) =>
        await t.mutation(internal.sync.upsertTagRedirects, {
          ...identity,
          rows: tagRedirects,
        }),
    },
  ];
  const batchHashes = batches.map((batch) =>
    syncPayloadHash({ kind: batch.kind, rows: batch.rows }),
  );
  const manifestHash = syncPayloadHash({
    syncVersion,
    batchHashes,
    expectedCounts,
    expectedTagCounts,
    expectedSourceCounts,
  });
  const begin = await t.mutation(internal.sync.begin, {
    syncVersion,
    manifestHash,
    batchHashes,
    expectedCounts,
    expectedTagCounts,
    expectedSourceCounts,
  });
  const batchLimit = Math.min(
    options.stageBatchCount ?? batches.length,
    batches.length,
  );
  for (
    let ordinal = begin.nextBatchOrdinal;
    ordinal < batchLimit;
    ordinal += 1
  ) {
    const batch = batches[ordinal];
    if (!batch) throw new Error(`missing fixture batch ${ordinal}`);
    await batch.run({
      syncVersion,
      manifestHash,
      ordinal,
      batchHash: batchHashes[ordinal] ?? '',
    });
  }
  if (
    (options.commit ?? true) &&
    batchLimit === batches.length &&
    !begin.alreadyCurrent
  ) {
    await t.mutation(internal.sync.commit, { syncVersion, manifestHash });
  }
  return {
    manifestHash,
    batchHashes,
    expectedCounts,
    expectedTagCounts,
    expectedSourceCounts,
  };
}

export async function seedDataset(
  t: ReturnType<typeof convexTest>,
  syncVersion = 'v1',
  options: SeedDatasetOptions = {},
) {
  return await stageDataset(t, syncVersion, options);
}
