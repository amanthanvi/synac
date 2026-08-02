import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { api, getConvexClient } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { KeyValueList } from '@/components/ui/KeyValue';

import layoutStyles from '../../_styles/Layout.module.css';
import browseStyles from '../../_styles/Browse.module.css';
import styles from './page.module.css';

export const revalidate = 900;

type SourcePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: SourcePageProps): Promise<Metadata> {
  const { slug } = await params;
  const source = await getConvexClient().query(api.sources.bySlug, { slug });

  if (!source) {
    return { title: 'Source not found' };
  }

  return {
    title: source.name,
    description: `License notes and attribution requirements for ${source.name}.`,
    alternates: { canonical: `/sources/${source.slug}` },
  };
}

export default async function SourcePage({ params, searchParams }: SourcePageProps) {
  const { slug } = await params;
  const client = getConvexClient();
  const source = await client.query(api.sources.bySlug, { slug });

  if (!source) notFound();

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 50;

  const { entries: citedEntries, hasMore } = await client.query(api.sources.citedEntries, {
    sourceSlug: source.slug,
    page,
    pageSize,
  });

  const prevHref = page > 1 ? `/sources/${source.slug}?page=${page - 1}` : undefined;
  const nextHref = hasMore ? `/sources/${source.slug}?page=${page + 1}` : undefined;

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title={source.name}
        subtitle="License notes and attribution requirements for this source."
      />

      <div className={styles.wrap}>
        <section className={styles.facts} aria-label="Source facts">
          <KeyValueList
            items={[
              {
                label: 'Base URL',
                value: (
                  <a
                    className={styles.link}
                    href={source.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.baseUrl}
                  </a>
                ),
              },
              { label: 'Verified', value: `Verified ${formatDate(new Date(source.lastVerifiedAt))}` },
              { label: 'License', value: source.licenseType },
              { label: 'Trust', value: source.trustTier.replace(/_/g, ' ').toLowerCase() },
              { label: 'Cited by', value: `${source.citedEntryCount.toLocaleString()} entries` },
            ]}
          />

          <div className={styles.section}>
            <h2 className={styles.sectionLabel}>Attribution</h2>
            <p className={styles.sectionText}>{source.attributionRequirements}</p>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionLabel}>Allowed use</h2>
            <p className={styles.sectionText}>{source.allowedUse}</p>
          </div>

          {source.licenseNotes ? (
            <div className={styles.section}>
              <h2 className={styles.sectionLabel}>License notes</h2>
              <p className={styles.sectionText}>{source.licenseNotes}</p>
            </div>
          ) : null}

          {source.licenseUrl ? (
            <div className={styles.section}>
              <h2 className={styles.sectionLabel}>License terms</h2>
              <a className={styles.link} href={source.licenseUrl} target="_blank" rel="noopener noreferrer">
                {source.licenseUrl}
              </a>
            </div>
          ) : null}
        </section>

        <section className={styles.cited} aria-label="Cited entries">
          <h2 className={styles.sectionLabel}>Cited entries</h2>

          {citedEntries.length === 0 ? (
            <p className={browseStyles.empty}>No cited entries yet.</p>
          ) : (
            <>
              <EntryRowList>
                {citedEntries.map((entry) => (
                  <EntryRow
                    key={entry.key}
                    href={
                      entry.entryType === 'TERM'
                        ? `/term/${entry.slug}`
                        : `/acronym/${entry.slug}`
                    }
                    title={entry.title}
                    entryType={entry.entryType}
                    summary={entry.summaryText}
                    meta={`Updated ${formatDate(new Date(entry.updatedAt))}`}
                  />
                ))}
              </EntryRowList>
              <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
