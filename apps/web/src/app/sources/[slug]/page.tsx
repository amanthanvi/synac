import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { getPrismaClient, resolvePublicSourceBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ButtonLink } from '@/components/ui/Button';
import { KeyValueList } from '@/components/ui/KeyValue';
import { Panel } from '@/components/ui/Panel';

import layoutStyles from '../../_styles/Layout.module.css';
import browseStyles from '../../_styles/Browse.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

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
  const offset = (page - 1) * pageSize;

  const citedCountRows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT e.id)::int AS "count"
    FROM entries e
    JOIN senses s ON s.entry_id = e.id
    JOIN field_provenance fp ON fp.entity_type = 'SENSE' AND fp.entity_id = s.id
    JOIN citations c ON c.id = fp.citation_id
    WHERE e.status = 'PUBLISHED'
      AND e.deleted_at IS NULL
      AND s.status = 'PUBLISHED'
      AND s.deleted_at IS NULL
      AND c.source_id = ${source.id}::uuid
  `;

  const citedCount = citedCountRows[0]?.count ?? 0;

  type CitedEntryRow = {
    id: string;
    entryType: 'TERM' | 'ACRONYM';
    displayTitle: string;
    primarySlug: string;
    summaryText: string | null;
    updatedAt: Date;
  };

  const citedEntries = await prisma.$queryRaw<CitedEntryRow[]>`
    SELECT DISTINCT
      e.id AS "id",
      e.entry_type AS "entryType",
      e.display_title AS "displayTitle",
      e.primary_slug AS "primarySlug",
      e.summary_text AS "summaryText",
      e.updated_at AS "updatedAt"
    FROM entries e
    JOIN senses s ON s.entry_id = e.id
    JOIN field_provenance fp ON fp.entity_type = 'SENSE' AND fp.entity_id = s.id
    JOIN citations c ON c.id = fp.citation_id
    WHERE e.status = 'PUBLISHED'
      AND e.deleted_at IS NULL
      AND s.status = 'PUBLISHED'
      AND s.deleted_at IS NULL
      AND c.source_id = ${source.id}::uuid
    ORDER BY e.normalized_title ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const citedEntryIds = citedEntries.map((e) => e.id);
  const citedEntryTags = citedEntryIds.length
    ? await prisma.entryTag.findMany({
        where: { entryId: { in: citedEntryIds }, tag: { deletedAt: null } },
        select: { entryId: true, tag: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ tag: { name: 'asc' } }],
      })
    : [];

  const tagsByEntryId = new Map<string, Array<(typeof citedEntryTags)[number]['tag']>>();
  for (const row of citedEntryTags) {
    const list = tagsByEntryId.get(row.entryId) ?? [];
    list.push(row.tag);
    tagsByEntryId.set(row.entryId, list);
  }

  const prevHref = page > 1 ? `/sources/${source.sourceSlug}?page=${page - 1}` : undefined;
  const nextHref =
    citedEntries.length === pageSize
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
              { label: 'License', value: source.licenseType },
              { label: 'Trust', value: source.trustTier },
              { label: 'Cited by', value: `${citedCount.toLocaleString()} entries` },
            ]}
          />

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Base URL</div>
            <a className={styles.link} href={source.baseUrl} target="_blank" rel="noopener noreferrer">
              {source.baseUrl}
            </a>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Attribution</div>
            <p className={styles.sectionText}>{source.attributionRequirements}</p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Allowed use</div>
            <p className={styles.sectionText}>{source.allowedUse}</p>
          </div>

          {source.licenseNotes ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>License notes</div>
              <p className={styles.sectionText}>{source.licenseNotes}</p>
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
            <div className={styles.sectionLabel}>Cited entries</div>
            <p className={styles.sectionText}>
              Published entries that include provenance linked to {source.name}.
            </p>

            {citedEntries.length === 0 ? (
              <div className={browseStyles.empty}>No cited entries yet.</div>
            ) : (
              <>
                <ol className={browseStyles.list}>
                  {citedEntries.map((entry) => {
                    const href =
                      entry.entryType === 'TERM'
                        ? `/term/${entry.primarySlug}`
                        : `/acronym/${entry.primarySlug}`;

                    const entryTags = tagsByEntryId.get(entry.id) ?? [];

                    return (
                      <li key={entry.id} className={browseStyles.item}>
                        <div className={browseStyles.itemTitleRow}>
                          <div className={browseStyles.itemTitleLeft}>
                            <span
                              className={`${browseStyles.typeBadge} ${
                                entry.entryType === 'TERM'
                                  ? browseStyles.typeBadgeTerm
                                  : browseStyles.typeBadgeAcronym
                              }`}
                            >
                              {entry.entryType}
                            </span>
                            <Link className={browseStyles.itemTitle} href={href}>
                              {entry.displayTitle}
                            </Link>
                          </div>
                          <span className={browseStyles.itemSlug}>
                            Updated {formatDate(entry.updatedAt)}
                          </span>
                        </div>

                        {entry.summaryText ? (
                          <p className={browseStyles.itemSummary}>{entry.summaryText}</p>
                        ) : null}

                        {entryTags.length ? (
                          <div className={browseStyles.itemTags}>
                            {entryTags.map((tag) => (
                              <Link
                                key={tag.id}
                                href={`/tags/${tag.slug}`}
                                className={browseStyles.tag}
                              >
                                {tag.name}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
                <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
