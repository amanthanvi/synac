/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';

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
    searchDocument: 'Back Door back door back-door trapdoor a hidden mechanism that bypasses authentication',
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

export async function seedDataset(t: ReturnType<typeof convexTest>, syncVersion = 'v1') {
  await t.mutation(internal.sync.upsertTags, {
    syncVersion,
    rows: [{ slug: 'malware', name: 'Malware', entryCount: 1 }],
  });
  await t.mutation(internal.sync.upsertSources, {
    syncVersion,
    rows: [
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
        citedEntryCount: 1,
      },
    ],
  });
  await t.mutation(internal.sync.upsertEntries, {
    syncVersion,
    rows: [
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
        searchDocument: 'IDS ids intrusion detection system monitors network traffic',
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
    ],
  });
  await t.mutation(internal.sync.upsertRelationships, {
    syncVersion,
    rows: [{ fromKey: 'TERM:back-door', toKey: 'ACRONYM:ids', type: 'RELATED' as const }],
  });
  await t.mutation(internal.sync.upsertRedirects, {
    syncVersion,
    rows: [{ entryType: 'TERM' as const, fromSlug: 'backdoor-old', toSlug: 'back-door' }],
  });
  await t.mutation(internal.sync.finish, { syncVersion, entryCount: 2 });
}
