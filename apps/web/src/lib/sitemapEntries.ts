export type EntrySitemapType = 'TERM' | 'ACRONYM';

export type EntrySitemapPage = {
  page: Array<{ slug: string; updatedAt: number }>;
  isDone: boolean;
  continueCursor: string;
  contentVersion: string | null;
  generationChanged: boolean;
};

export async function collectEntrySitemapUrls(input: {
  siteUrl: string;
  entryType: EntrySitemapType;
  fetchPage: (args: {
    cursor: string | null;
    expectedVersion: string | null;
  }) => Promise<EntrySitemapPage>;
}): Promise<Array<{ loc: string; lastmod: Date }>> {
  const urls: Array<{ loc: string; lastmod: Date }> = [];
  let cursor: string | null = null;
  let expectedVersion: string | null = null;
  let restarts = 0;
  while (true) {
    const page = await input.fetchPage({ cursor, expectedVersion });
    if (page.generationChanged) {
      if (restarts >= 1) {
        throw new Error(
          `content generation changed twice while building the ${input.entryType.toLowerCase()} sitemap`,
        );
      }
      restarts += 1;
      urls.length = 0;
      cursor = null;
      expectedVersion = page.contentVersion;
      continue;
    }
    expectedVersion = page.contentVersion;
    const segment = input.entryType === 'TERM' ? 'term' : 'acronym';
    for (const entry of page.page) {
      urls.push({
        loc: `${input.siteUrl}/${segment}/${entry.slug}`,
        lastmod: new Date(entry.updatedAt),
      });
    }
    if (page.isDone) return urls;
    cursor = page.continueCursor;
  }
}
