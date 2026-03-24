import { logger } from './logger';

export function logSearchIndexCoverage(input: {
  location: string;
  publishedEntries: number;
  indexedEntries: number;
  missingEntryIds: string[];
  orphanedEntryIds: string[];
}): void {
  logger.info('search.index.coverage', {
    location: input.location,
    publishedEntries: input.publishedEntries,
    indexedEntries: input.indexedEntries,
    missingCount: input.missingEntryIds.length,
    orphanedCount: input.orphanedEntryIds.length,
    sampleMissingEntryIds: input.missingEntryIds.slice(0, 10),
    sampleOrphanedEntryIds: input.orphanedEntryIds.slice(0, 10),
  });
}
