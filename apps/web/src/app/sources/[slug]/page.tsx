import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EntryListItem } from '@/components/EntryListItem';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { KeyValueList } from '@/components/ui/KeyValue';
import { Panel } from '@/components/ui/Panel';
import { getSourceBySlug, getSourceCitedEntries } from '@/lib/publicData';
import { formatDate } from '@/lib/publicFormat';
import { formatLicenseType, formatTrustTier } from '@/lib/publicLabels';

import layoutStyles from '../../_styles/Layout.module.css';
import browseStyles from '../../_styles/Browse.module.css';
import styles from './page.module.css';

// Reads searchParams (page).
export const dynamic = 'force-dynamic';

type SourcePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
};

const PAGE_SIZE = 50;

export async function generateMetadata({
  params,
}: SourcePageProps): Promise<Metadata> {
  const { slug } = await params;
  const source = await getSourceBySlug(slug);

  if (!source) {
    return { title: 'Source not found' };
  }

  return {
    title: source.name,
    description: `License notes and attribution requirements for ${source.name}.`,
    alternates: { canonical: `/sources/${source.sourceSlug}` },
  };
}

export default async function SourcePage({
  params,
  searchParams,
}: SourcePageProps) {
  const { slug } = await params;
  const source = await getSourceBySlug(slug);

  if (!source) notFound();

  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const { items, total } = await getSourceCitedEntries({
    sourceId: source.id,
    sourceSlug: source.sourceSlug,
    page,
    pageSize: PAGE_SIZE,
  });

  const prevHref =
    page > 1 ? `/sources/${source.sourceSlug}?page=${page - 1}` : undefined;
  const nextHref =
    page * PAGE_SIZE < total
      ? `/sources/${source.sourceSlug}?page=${page + 1}`
      : undefined;

  return (
    <>
      <PageHeader
        badge="Source"
        title={source.name}
        subtitle="License notes and attribution requirements for this source."
      />

      <div className={styles.wrap}>
        <Panel className={layoutStyles.narrow}>
          <KeyValueList
            items={[
              {
                label: 'Verified',
                value: source.lastVerifiedAt
                  ? `Verified ${formatDate(source.lastVerifiedAt)}`
                  : 'Not yet verified',
              },
              {
                label: 'License',
                value: source.licenseUrl ? (
                  <a
                    className={styles.link}
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {formatLicenseType(source.licenseType)}
                  </a>
                ) : (
                  formatLicenseType(source.licenseType)
                ),
              },
              { label: 'Trust', value: formatTrustTier(source.trustTier) },
              { label: 'Cited by', value: `${total.toLocaleString()} entries` },
            ]}
          />

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Base URL</div>
            <a
              className={styles.link}
              href={source.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.baseUrl}
            </a>
          </div>

          {source.licensePublicStatement ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>License statement</div>
              <p className={styles.sectionText}>
                {source.licensePublicStatement}
              </p>
            </div>
          ) : null}

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Attribution</div>
            <Markdown>{source.attributionRequirements}</Markdown>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Allowed use</div>
            <Markdown>{source.allowedUse}</Markdown>
          </div>

          {source.licenseNotes ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>License notes</div>
              <Markdown>{source.licenseNotes}</Markdown>
            </div>
          ) : null}

          {source.contact ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Contact</div>
              <p className={styles.sectionText}>{source.contact}</p>
            </div>
          ) : null}

          <div className={styles.actions}>
            <ButtonLink href="/sources" size="sm">
              All sources
            </ButtonLink>
          </div>
        </Panel>

        <div className={layoutStyles.narrow}>
          <div className={styles.section}>
            <h2 className={styles.sectionLabel}>Cited entries</h2>
            <p className={styles.sectionText}>
              Published entries that include provenance linked to {source.name}.
            </p>

            {items.length === 0 ? (
              <EmptyState title="No cited entries yet">
                No published entry currently cites {source.name}.
              </EmptyState>
            ) : (
              <>
                <ol className={browseStyles.list}>
                  {items.map((entry) => (
                    <EntryListItem
                      key={entry.id}
                      entryType={entry.entryType}
                      title={entry.displayTitle}
                      href={
                        entry.entryType === 'TERM'
                          ? `/term/${entry.primarySlug}`
                          : `/acronym/${entry.primarySlug}`
                      }
                      meta={`Updated ${formatDate(entry.updatedAt)}`}
                      summary={entry.summaryText}
                      tags={entry.tags}
                    />
                  ))}
                </ol>
                <Pagination
                  page={page}
                  total={total}
                  pageSize={PAGE_SIZE}
                  prevHref={prevHref}
                  nextHref={nextHref}
                  unit="entries"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
