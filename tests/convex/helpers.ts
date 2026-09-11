/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import type { FunctionArgs } from 'convex/server';
import { internal } from '../../convex/_generated/api';
import type { CompiledDataset } from '../../tools/content/src/model';
import {
  createSyncPlan,
  syncPayloadHash,
} from '../../tools/content/src/sync-plan';

export const modules = import.meta.glob('../../convex/**/*.ts');

type EntryRow = FunctionArgs<
  typeof internal.sync.upsertEntries
>['rows'][number];
type SenseRow = EntryRow['senses'][number];

export function makeEntryRow(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    key: 'TERM:back-door',
    entryType: 'TERM' as const,
    slug: 'back-door',
    title: 'Back Door',
    normalizedTitle: 'back door',
    aliases: ['trapdoor'],
    summaryText: 'A hidden access mechanism.',
    snippetText: 'A hidden access mechanism.',
    matchTerms: ['trapdoor'],
    updatedAt: Date.parse('2026-07-01T00:00:00Z'),
    senseCount: 1,
    searchDocument:
      'Back Door back door back-door trapdoor a hidden mechanism that bypasses authentication',
    tags: [{ slug: 'malware', assignedBy: 'EDITORIAL' as const }],
    tagSlugs: ['malware'],
    citedSourceSlugs: ['rfc4949'],
    senses: [makeSenseRow()],
    ...overrides,
  };
}

export function makeSenseRow(overrides: Partial<SenseRow> = {}): SenseRow {
  return {
    key: 'rfc4949:back-door',
    order: 0,
    labelFallback: 'RFC 4949',
    needsLabel: false,
    normalizedLabel: 'back door',
    definitionMd: 'A **hidden** mechanism that bypasses authentication.',
    definitionText: 'A hidden mechanism that bypasses authentication.',
    isEditorial: false,
    isPreferred: true,
    examples: [],
    attestations: [],
    citations: [makeCitation()],
    ...overrides,
  };
}

function makeCitation(): SenseRow['citations'][number] {
  return {
    sourceSlug: 'rfc4949',
    sourceName: 'RFC 4949',
    url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
    contentMode: 'QUOTED' as const,
    documentSha256: 'a'.repeat(64),
    attributionText: 'RFC 4949, IETF',
    accessedAt: Date.parse('2026-07-01T00:00:00Z'),
  };
}

export type SeedDatasetOptions = {
  tags?: Array<{
    slug: string;
    name: string;
    entryCount: number;
    editorialCount?: number;
    autoCount?: number;
  }>;
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
  const tags = (
    options.tags ?? [{ slug: 'malware', name: 'Malware', entryCount: 1 }]
  ).map((tag) => ({
    editorialCount: tag.entryCount,
    autoCount: 0,
    ...tag,
  }));
  const sources = (
    options.sources ?? [
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
    ]
  ).map((source) => ({ contentMode: 'QUOTED' as const, ...source }));
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
      snippetText: 'Intrusion detection system.',
      matchTerms: ['intrusion detection system'],
      senseSummary: 'Intrusion Detection System',
      searchDocument:
        'IDS ids intrusion detection system monitors network traffic',
      tags: [],
      tagSlugs: [],
      citedSourceSlugs: ['rfc4949'],
      senses: [
        makeSenseRow({
          key: 'rfc4949:ids',
          labelFallback: 'RFC 4949',
          normalizedLabel: 'intrusion detection system',
          definitionMd: 'A system that monitors for intrusions.',
          definitionText: 'A system that monitors for intrusions.',
          expandedForm: 'Intrusion Detection System',
          attestations: [],
          citations: [],
        }),
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
    ...(entries.length > 0
      ? [
          {
            kind: 'entries',
            rows: entries,
            run: async (identity: BatchIdentity) =>
              await t.mutation(internal.sync.upsertEntries, {
                ...identity,
                rows: entries,
              }),
          },
        ]
      : []),
    ...(relationships.length > 0
      ? [
          {
            kind: 'relationships',
            rows: relationships,
            run: async (identity: BatchIdentity) =>
              await t.mutation(internal.sync.upsertRelationships, {
                ...identity,
                rows: relationships,
              }),
          },
        ]
      : []),
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
  const plan = createSyncPlan({
    contentVersion: syncVersion,
    sources: sources.map((source) => ({
      ...source,
      licenseUrl: undefined,
      licenseNotes: undefined,
      publicStatement: undefined,
    })),
    tags: tags.map((tag) => ({ ...tag, description: undefined })),
    entries: entries.map(({ senses: _senses, ...entry }) => entry),
    senses: entries.flatMap((entry) =>
      entry.senses.map((sense) => ({ ...sense, entryKey: entry.key })),
    ),
    relationships,
    redirects,
    tagRedirects: tagRedirects.map((redirect) => ({
      ...redirect,
      toSlug: redirect.toSlug,
    })),
  } as CompiledDataset);
  if (plan.batches.length !== batches.length) {
    throw new Error(
      `fixture runner supports one batch per kind; production plan produced ${plan.batches.length} batches`,
    );
  }
  for (const [ordinal, batch] of batches.entries()) {
    const planned = plan.batches[ordinal];
    const localHash = syncPayloadHash({ kind: batch.kind, rows: batch.rows });
    if (!planned || planned.kind !== batch.kind || planned.hash !== localHash) {
      throw new Error(`fixture batch ${ordinal} diverges from createSyncPlan`);
    }
  }
  const requestedBatchCount = options.stageBatchCount ?? batches.length;
  if (
    !Number.isSafeInteger(requestedBatchCount) ||
    requestedBatchCount < 0 ||
    requestedBatchCount > batches.length
  ) {
    throw new Error(
      `stageBatchCount must be an integer from 0 through ${batches.length}`,
    );
  }
  const begin = await t.mutation(internal.sync.begin, {
    syncVersion,
    manifestHash: plan.manifestHash,
    batchHashes: plan.batchHashes,
    expectedCounts: plan.expectedCounts,
    expectedTagCounts: plan.expectedTagCounts,
    expectedSourceCounts: plan.expectedSourceCounts,
  });
  const batchLimit = requestedBatchCount;
  for (
    let ordinal = begin.nextBatchOrdinal;
    ordinal < batchLimit;
    ordinal += 1
  ) {
    const batch = batches[ordinal];
    if (!batch) throw new Error(`missing fixture batch ${ordinal}`);
    await batch.run({
      syncVersion,
      manifestHash: plan.manifestHash,
      ordinal,
      batchHash: plan.batchHashes[ordinal] ?? '',
    });
  }
  if (
    (options.commit ?? true) &&
    batchLimit === batches.length &&
    !begin.alreadyCurrent
  ) {
    await t.mutation(internal.sync.commit, {
      syncVersion,
      manifestHash: plan.manifestHash,
    });
  }
  return plan;
}

export async function seedDataset(
  t: ReturnType<typeof convexTest>,
  syncVersion = 'v1',
  options: SeedDatasetOptions = {},
) {
  return await stageDataset(t, syncVersion, options);
}
