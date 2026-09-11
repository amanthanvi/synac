import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSourceDirectory } from '@/lib/publicData';
import { formatDate } from '@/lib/publicFormat';
import { formatLicenseType, formatTrustTierShort } from '@/lib/publicLabels';

import styles from '../_styles/Browse.module.css';

// DB-backed with no searchParams. Kept dynamic because `next build` runs in
// environments without DATABASE_URL (e.g. the CodeQL workflow), so this route
// must not be prerendered. Freshness still comes from the `unstable_cache`
// tags in lib/publicData.ts, which `revalidateTag` invalidates on publish.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sources',
  description:
    'Registered SynAc sources with their licences, attribution requirements, and trust tiers.',
  alternates: { canonical: '/sources' },
};

export default async function SourcesPage() {
  const { sources, stats } = await getSourceDirectory();

  const statsBySourceId = new Map(stats.map((row) => [row.id, row] as const));

  return (
    <>
      <PageHeader
        badge="Sources"
        title="Sources"
        subtitle="Registered sources with license notes and attribution requirements."
      />

      {sources.length === 0 ? (
        <EmptyState title="No sources yet">
          Once ingest is configured, this page will list attribution
          requirements per source.
        </EmptyState>
      ) : (
        <ol className={styles.list}>
          {sources.map((source) => {
            const stat = statsBySourceId.get(source.id);
            const citedCount = stat?.citedCount ?? 0;

            return (
              <li key={source.id} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <Link
                    className={styles.itemTitle}
                    href={`/sources/${source.sourceSlug}`}
                  >
                    {source.name}
                  </Link>
                  <span className={styles.itemSlug}>
                    {stat?.latestAccessedAt ? (
                      <>Latest {formatDate(stat.latestAccessedAt)}</>
                    ) : (
                      <>No citations yet</>
                    )}
                  </span>
                </div>
                <p className={styles.itemSummary}>
                  <span className={styles.metaStrong}>{source.baseUrl}</span>
                  <span className={styles.metaSep}>·</span>
                  <span className={styles.metaMuted}>
                    {formatLicenseType(source.licenseType)}
                  </span>
                </p>
                <div className={styles.itemTags}>
                  <span className={styles.tag}>
                    {formatTrustTierShort(source.trustTier)}
                  </span>
                  <span className={styles.tag}>
                    {citedCount.toLocaleString()} cited{' '}
                    {citedCount === 1 ? 'entry' : 'entries'}
                  </span>
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
