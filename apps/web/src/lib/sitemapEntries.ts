type EntrySitemapType = 'TERM' | 'ACRONYM';

export type EntrySlugRecord = { slug: string; updatedAt: number };

export type EntrySitemapPage = {
  page: EntrySlugRecord[];
  isDone: boolean;
  continueCursor: string;
  contentVersion: string | null;
  generationChanged: boolean;
};

/**
 * Walks every slug of one entry type. A content deploy swaps the whole
 * generation mid-walk, so a changed generation restarts the walk once rather
 * than emitting a list that mixes two versions of the corpus.
 */
export async function collectEntrySlugs(input: {
  entryType: EntrySitemapType;
  fetchPage: (args: {
    cursor: string | null;
    expectedVersion: string | null;
  }) => Promise<EntrySitemapPage>;
}): Promise<EntrySlugRecord[]> {
  const records: EntrySlugRecord[] = [];
  let cursor: string | null = null;
  let expectedVersion: string | null = null;
  let restarts = 0;
  while (true) {
    const page = await input.fetchPage({ cursor, expectedVersion });
    if (page.generationChanged) {
      if (restarts >= 1) {
        throw new Error(
          `content generation changed twice while listing ${input.entryType.toLowerCase()} slugs`,
        );
      }
      restarts += 1;
      records.length = 0;
      cursor = null;
      expectedVersion = page.contentVersion;
      continue;
    }
    expectedVersion = page.contentVersion;
    records.push(...page.page);
    if (page.isDone) return records;
    cursor = page.continueCursor;
  }
}
