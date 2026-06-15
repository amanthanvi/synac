import Link from 'next/link';

import { queryPublicConvex } from '@synac/db';

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
  const sources = await queryPublicConvex<
    Array<{
      id: string;
      name: string;
      sourceSlug: string;
      baseUrl: string;
      licenseType: string;
      lastVerifiedAt: Date | null;
      trustTier: string;
      citationCount: number;
      maxAccessedAt: Date | null;
    }>
  >('listPublicSourcesWithStats');

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
            return (
              <li key={source.id} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <Link className={styles.itemTitle} href={`/sources/${source.sourceSlug}`}>
                    {source.name}
                  </Link>
                  <span className={styles.itemSlug}>
                    {source.maxAccessedAt ? (
                      <>Latest {formatDate(source.maxAccessedAt)}</>
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
                  <span className={styles.tag}>{source.citationCount.toLocaleString()} citations</span>
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
