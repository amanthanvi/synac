import Link from 'next/link';

import { queryPublicConvex } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../_styles/Layout.module.css';
import styles from '../_styles/Tags.module.css';

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
      citationCountIsApproximate?: boolean;
      maxAccessedAt: Date | null;
    }>
  >('listPublicSourcesWithStats');

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Sources"
        subtitle="Registered sources with license notes and attribution requirements."
      />

      {sources.length === 0 ? (
        <p className={styles.empty}>
          No sources yet. Once ingest is configured, this page will list attribution requirements
          per source.
        </p>
      ) : (
        <ol className={styles.list}>
          {sources.map((source) => (
            <li key={source.id} className={styles.item}>
              <div className={styles.itemTitleRow}>
                <Link className={styles.itemTitle} href={`/sources/${source.sourceSlug}`}>
                  {source.name}
                </Link>
                <span className={styles.itemSlug}>
                  {source.citationCount.toLocaleString()}
                  {source.citationCountIsApproximate ? '+' : ''} citations
                </span>
              </div>
              <p className={styles.itemDesc}>
                {source.licenseType} ·{' '}
                {source.lastVerifiedAt
                  ? `verified ${formatDate(source.lastVerifiedAt)}`
                  : 'not yet verified'}
                {source.maxAccessedAt ? ` · latest access ${formatDate(source.maxAccessedAt)}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
