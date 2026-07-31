import Link from 'next/link';

import { api, getConvexClient } from '@/lib/convex';
import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Browse.module.css';

export const revalidate = 900;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function SourcesPage() {
  const sources = await getConvexClient().query(api.sources.list, {});

  return (
    <>
      <PageHeader
        badge="Sources"
        title="Sources"
        subtitle="Registered sources with license notes and attribution requirements."
      />

      {sources.length === 0 ? (
        <div className={styles.empty}>
          No sources yet. The source registry lives in the open-source repository under
          content/sources.
        </div>
      ) : (
        <ol className={styles.list}>
          {sources.map((source) => {
            return (
              <li key={source.slug} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <Link className={styles.itemTitle} href={`/sources/${source.slug}`}>
                    {source.name}
                  </Link>
                  <span className={styles.itemSlug}>
                    Verified {formatDate(new Date(source.lastVerifiedAt))}
                  </span>
                </div>
                <p className={styles.itemSummary}>
                  <span className={styles.metaStrong}>{source.baseUrl}</span>
                  <span className={styles.metaSep}>·</span>
                  <span className={styles.metaMuted}>{source.licenseType}</span>
                </p>
                <div className={styles.itemTags}>
                  <span className={styles.tag}>{source.trustTier.replace('_', ' ')}</span>
                  <span className={styles.tag}>
                    {source.citedEntryCount.toLocaleString()} cited entries
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
