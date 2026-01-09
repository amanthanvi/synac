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
          {sources.map((source) => (
            <li key={source.id} className={styles.item}>
              <div className={styles.itemTitleRow}>
                <Link className={styles.itemTitle} href={`/sources/${source.sourceSlug}`}>
                  {source.name}
                </Link>
                <span className={styles.itemSlug}>
                  {source.lastVerifiedAt ? (
                    <>Verified {formatDate(source.lastVerifiedAt)}</>
                  ) : (
                    <>Unverified</>
                  )}
                </span>
              </div>
              <p className={styles.itemSummary}>
                <span className={styles.metaStrong}>{source.baseUrl}</span>
                <span className={styles.metaSep}>·</span>
                <span className={styles.metaMuted}>{source.licenseType}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
