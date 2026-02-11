import Link from 'next/link';

import { getPrismaClient, listPublicSources } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function SourcesPage() {
  const prisma = getPrismaClient();
  const sources = await listPublicSources(prisma);
  const sourceIds = sources.map((s) => s.id);
  const citationAgg = sourceIds.length
    ? await prisma.citation.groupBy({
        by: ['sourceId'],
        where: { sourceId: { in: sourceIds } },
        _count: { sourceId: true },
        _max: { accessedAt: true },
      })
    : [];

  const citationBySourceId = new Map<
    string,
    { count: number; maxAccessedAt: Date | null }
  >();
  for (const row of citationAgg) {
    citationBySourceId.set(row.sourceId, {
      count: row._count.sourceId,
      maxAccessedAt: row._max.accessedAt ?? null,
    });
  }

  return (
    <>
      <PageHeader
        badge="Sources"
        title="Sources"
        subtitle="Registered sources with license notes and attribution requirements."
      />

      {sources.length === 0 ? (
        <div className={styles.empty}>
          No sources yet. Once ingest is configured, this page will list attribution requirements
          per source.
        </div>
      ) : (
        <ol className={styles.list}>
          {sources.map((source) => {
            const stats = citationBySourceId.get(source.id) ?? {
              count: 0,
              maxAccessedAt: null as Date | null,
            };

            return (
              <li key={source.id} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <Link className={styles.itemTitle} href={`/sources/${source.sourceSlug}`}>
                    {source.name}
                  </Link>
                  <span className={styles.itemSlug}>
                    {stats.maxAccessedAt ? (
                      <>Latest {formatDate(stats.maxAccessedAt)}</>
                    ) : (
                      <>No citations yet</>
                    )}
                  </span>
                </div>
                <p className={styles.itemSummary}>
                  <span className={styles.metaStrong}>{source.baseUrl}</span>
                  <span className={styles.metaSep}>·</span>
                  <span className={styles.metaMuted}>{source.licenseType}</span>
                </p>
                <div className={styles.itemTags}>
                  <span className={styles.tag}>{source.trustTier.replace('_', ' ')}</span>
                  <span className={styles.tag}>{stats.count.toLocaleString()} citations</span>
                  <span className={styles.tag}>
                    {source.lastVerifiedAt
                      ? `Verified ${formatDate(source.lastVerifiedAt)}`
                      : 'Unverified'}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
