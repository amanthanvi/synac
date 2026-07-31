import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPrismaClient, queryPublicConvex, resolvePublicSourceBySlug } from '@synac/db';

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
  const prisma = getPrismaClient();
  const source = await resolvePublicSourceBySlug(prisma, { slug });

  if (!source) {
    return { title: 'Source not found' };
  }

  return {
    title: source.name,
    description: `License notes and attribution requirements for ${source.name}.`,
    alternates: { canonical: `/sources/${source.sourceSlug}` },
  };
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function SourcePage({ params, searchParams }: SourcePageProps) {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const source = await resolvePublicSourceBySlug(prisma, { slug });

  if (!source) notFound();

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 50;
  type CitedEntryRow = {
    id: string;
    entryType: 'TERM' | 'ACRONYM';
    displayTitle: string;
    primarySlug: string;
    summaryText: string | null;
    updatedAt: Date;
  };

  const cited = await queryPublicConvex<{ count: number; entries: CitedEntryRow[] }>(
    'listCitedEntriesForSource',
    {
      sourceId: source.id,
      page,
      pageSize,
    },
  );
  const citedCount = cited.count;
  const citedEntries = cited.entries;

  const prevHref = page > 1 ? `/sources/${source.sourceSlug}?page=${page - 1}` : undefined;
  const nextHref =
    citedEntries.length === pageSize ? `/sources/${source.sourceSlug}?page=${page + 1}` : undefined;

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
              { label: 'License', value: source.licenseType },
              { label: 'Trust', value: source.trustTier.replace('_', ' ').toLowerCase() },
              {
                label: 'Verified',
                value: source.lastVerifiedAt
                  ? formatDate(source.lastVerifiedAt)
                  : 'Not yet verified',
              },
              { label: 'Cited by', value: `${citedCount.toLocaleString()} entries` },
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

          {source.contact ? (
            <div className={styles.section}>
              <h2 className={styles.sectionLabel}>Contact</h2>
              <p className={styles.sectionText}>{source.contact}</p>
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
                    key={entry.id}
                    href={
                      entry.entryType === 'TERM'
                        ? `/term/${entry.primarySlug}`
                        : `/acronym/${entry.primarySlug}`
                    }
                    title={entry.displayTitle}
                    entryType={entry.entryType}
                    summary={entry.summaryText}
                    meta={`Updated ${formatDate(entry.updatedAt)}`}
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
