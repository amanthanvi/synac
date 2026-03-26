import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { getPrismaClient, getSearchIndexCoverage } from '@synac/db';
import { logSearchIndexCoverage } from '@/lib/observability';

import layoutStyles from '@/app/_styles/Layout.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminSearchIndexPage() {
  const prisma = getPrismaClient();
  const coverage = await getSearchIndexCoverage(prisma, { limit: 20 });
  logSearchIndexCoverage({
    location: 'admin.search-index',
    publishedEntries: coverage.publishedEntries,
    indexedEntries: coverage.indexedEntries,
    missingEntryIds: coverage.missingEntryIds,
    orphanedEntryIds: coverage.orphanedEntryIds,
  });

  return (
    <>
      <PageHeader
        badge="Admin"
        title="Search index"
        subtitle="Coverage and integrity of the Postgres-backed entry_search index."
      />

      <div className={layoutStyles.stack}>
        <Panel className={layoutStyles.narrow}>
          <div className={layoutStyles.stack}>
            <div>
              <strong>Published entries:</strong> {coverage.publishedEntries.toLocaleString()}
            </div>
            <div>
              <strong>Indexed entries:</strong> {coverage.indexedEntries.toLocaleString()}
            </div>
            <div>
              <strong>Missing rows:</strong> {coverage.missingEntryIds.length.toLocaleString()}
            </div>
            <div>
              <strong>Orphaned rows:</strong> {coverage.orphanedEntryIds.length.toLocaleString()}
            </div>
          </div>
        </Panel>

        <Panel className={layoutStyles.narrow}>
          <div className={layoutStyles.stack}>
            <div>
              <strong>Missing entry IDs</strong>
            </div>
            {coverage.missingEntryIds.length === 0 ? (
              <div>None.</div>
            ) : (
              <ul>
                {coverage.missingEntryIds.map((entryId) => (
                  <li key={entryId}>
                    <code>{entryId}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel className={layoutStyles.narrow}>
          <div className={layoutStyles.stack}>
            <div>
              <strong>Orphaned entry_search rows</strong>
            </div>
            {coverage.orphanedEntryIds.length === 0 ? (
              <div>None.</div>
            ) : (
              <ul>
                {coverage.orphanedEntryIds.map((entryId) => (
                  <li key={entryId}>
                    <code>{entryId}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
