import Link from 'next/link';
import type { Metadata } from 'next';

import { readSources } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../_styles/Layout.module.css';
import styles from '../_styles/Tags.module.css';

export const revalidate = 900;

const title = 'Sources';
const description =
  'Every source SynAc cites, with its license, allowed use, and attribution requirements.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/sources' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default async function SourcesPage() {
  const sources = await readSources();

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Sources"
        subtitle="Registered sources with license notes and attribution requirements."
      />

      {sources.length === 0 ? (
        <div className={styles.empty}>
          No sources yet. The source registry lives in the open-source
          repository under content/sources.
        </div>
      ) : (
        <ol className={styles.list}>
          {sources.map((source) => (
            <li key={source.slug} className={styles.item}>
              <div className={styles.itemTitleRow}>
                <Link
                  className={styles.itemTitle}
                  href={`/sources/${source.slug}`}
                >
                  {source.name}
                </Link>
                <span className={styles.itemSlug}>
                  Verified {formatDate(new Date(source.lastVerifiedAt))}
                </span>
              </div>
              <p className={styles.itemDesc}>
                <span className={layoutStyles.mono}>{source.baseUrl}</span> ·{' '}
                {source.licenseType} · {source.citedEntryCount.toLocaleString()}{' '}
                cited entries
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
