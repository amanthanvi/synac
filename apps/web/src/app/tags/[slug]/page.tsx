import Link from 'next/link';
import type { Metadata } from 'next';

import { api, getConvexClient } from '@/lib/convex';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import browseStyles from '../../_styles/Browse.module.css';
import tagStyles from '../../_styles/Tags.module.css';

export const revalidate = 300;

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ type?: string; page?: string }>;
};

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getConvexClient().query(api.tags.bySlug, { slug });

  if (!tag) {
    return { title: 'Tag not found' };
  }

  return {
    title: tag.name,
    description: tag.description ?? `SynAc entries tagged “${tag.name}”.`,
    alternates: { canonical: `/tags/${tag.slug}` },
  };
}

function parseEntryType(value: string | undefined): 'TERM' | 'ACRONYM' | undefined {
  const v = value?.toUpperCase();
  if (v === 'TERM') return 'TERM';
  if (v === 'ACRONYM') return 'ACRONYM';
  return undefined;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const entryType = parseEntryType(sp.type);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 50;

  const client = getConvexClient();
  const tag = await client.query(api.tags.bySlug, { slug });

  if (!tag) {
    return (
      <>
        <PageHeader badge="Tag" title="Not found" subtitle="This tag does not exist." />
        <div className={tagStyles.empty}>
          Try <Link href="/tags">all tags</Link>.
        </div>
      </>
    );
  }

  const { entries, hasMore } = await client.query(api.tags.entriesForTag, {
    tagSlug: tag.slug,
    entryType: entryType ?? null,
    page,
    pageSize,
  });

  const baseHref = `/tags/${tag.slug}${entryType ? `?type=${encodeURIComponent(entryType)}` : ''}`;
  const prevHref = page > 1 ? `${baseHref}${entryType ? '&' : '?'}page=${page - 1}` : undefined;
  const nextHref = hasMore ? `${baseHref}${entryType ? '&' : '?'}page=${page + 1}` : undefined;

  return (
    <>
      <PageHeader
        badge="Tag"
        title={tag.name}
        subtitle={tag.description ?? 'Published entries associated with this tag.'}
      />

      <nav className={tagStyles.filters} aria-label="Entry type filter">
        <Link
          className={`${tagStyles.chip} ${!entryType ? tagStyles.chipActive : ''}`}
          href={`/tags/${tag.slug}`}
        >
          All
        </Link>
        <Link
          className={`${tagStyles.chip} ${entryType === 'TERM' ? tagStyles.chipActive : ''}`}
          href={`/tags/${tag.slug}?type=TERM`}
        >
          Terms
        </Link>
        <Link
          className={`${tagStyles.chip} ${entryType === 'ACRONYM' ? tagStyles.chipActive : ''}`}
          href={`/tags/${tag.slug}?type=ACRONYM`}
        >
          Acronyms
        </Link>
      </nav>

      {entries.length === 0 ? (
        <div className={browseStyles.empty}>No published entries yet for this tag.</div>
      ) : (
        <>
          <ol className={browseStyles.list}>
            {entries.map((entry) => (
              <li key={entry.key} className={browseStyles.item}>
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
                    <Link
                      className={browseStyles.itemTitle}
                      href={
                        entry.entryType === 'TERM' ? `/term/${entry.slug}` : `/acronym/${entry.slug}`
                      }
                    >
                      {entry.title}
                    </Link>
                  </div>
                  <span className={browseStyles.itemSlug}>
                    Updated {formatDate(new Date(entry.updatedAt))}
                  </span>
                </div>
                {entry.summaryText ? (
                  <p className={browseStyles.itemSummary}>{entry.summaryText}</p>
                ) : null}
              </li>
            ))}
          </ol>
          <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
        </>
      )}
    </>
  );
}
