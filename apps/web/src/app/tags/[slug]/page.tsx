import Link from 'next/link';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';

import { api, getConvexClient } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import {
  parseTagEntryType,
  parseTagPage,
  tagRedirectPath,
} from '@/lib/tagRouting';

import browseStyles from '../../_styles/Browse.module.css';
import tagStyles from '../../_styles/Tags.module.css';
import layoutStyles from '../../_styles/Layout.module.css';

export const revalidate = 300;

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ type?: string; page?: string }>;
};

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const client = getConvexClient();
  const resolution = await client.query(api.tags.resolveSlug, { slug });
  if (resolution?.kind === 'RETIRED') {
    return { title: 'Retired tag', robots: { index: false, follow: true } };
  }
  if (!resolution) return { title: 'Tag not found' };
  const tag = await client.query(api.tags.bySlug, {
    slug: resolution.slug,
  });

  if (!tag) {
    return { title: 'Tag not found' };
  }

  return {
    title: tag.name,
    description: tag.description ?? `SynAc entries tagged “${tag.name}”.`,
    alternates: { canonical: `/tags/${tag.slug}` },
  };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const entryType = parseTagEntryType(sp.type);
  const page = parseTagPage(sp.page);
  const pageSize = 50;

  const client = getConvexClient();
  const resolution = await client.query(api.tags.resolveSlug, { slug });
  if (!resolution) {
    return (
      <div className={layoutStyles.pageNarrow}>
        <PageHeader title="Tag not found" subtitle="This tag does not exist." />
        <div className={tagStyles.empty}>
          Try <Link href="/tags">all tags</Link>.
        </div>
      </div>
    );
  }
  if (resolution.kind === 'REDIRECT') {
    permanentRedirect(tagRedirectPath(resolution.slug, entryType, page));
  }
  if (resolution.kind === 'RETIRED') {
    return (
      <div className={layoutStyles.pageNarrow}>
        <PageHeader
          title="Retired tag"
          subtitle="This taxonomy label is no longer published."
        />
        <div className={tagStyles.empty}>
          Browse <Link href="/tags">the current tag taxonomy</Link>.
        </div>
      </div>
    );
  }
  const tag = await client.query(api.tags.bySlug, { slug: resolution.slug });

  if (!tag) {
    return (
      <div className={layoutStyles.pageNarrow}>
        <PageHeader title="Tag not found" subtitle="This tag does not exist." />
        <div className={tagStyles.empty}>
          Try <Link href="/tags">all tags</Link>.
        </div>
      </div>
    );
  }

  const { entries, hasMore } = await client.query(api.tags.entriesForTag, {
    tagSlug: tag.slug,
    entryType: entryType ?? null,
    page,
    pageSize,
  });

  const baseHref = `/tags/${tag.slug}${entryType ? `?type=${encodeURIComponent(entryType)}` : ''}`;
  const prevHref =
    page > 1
      ? `${baseHref}${entryType ? '&' : '?'}page=${page - 1}`
      : undefined;
  const nextHref = hasMore
    ? `${baseHref}${entryType ? '&' : '?'}page=${page + 1}`
    : undefined;

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title={tag.name}
        subtitle={
          tag.description ?? 'Published entries associated with this tag.'
        }
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
        <div className={browseStyles.empty}>
          No published entries yet for this tag.
        </div>
      ) : (
        <>
          <EntryRowList>
            {entries.map((entry) => (
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
    </div>
  );
}
