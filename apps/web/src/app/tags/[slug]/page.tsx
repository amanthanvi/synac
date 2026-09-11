import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';

import { EntryListItem } from '@/components/EntryListItem';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { getTagBySlug, getTagEntries } from '@/lib/publicData';
import { formatDate } from '@/lib/publicFormat';
import { buildTagJsonLd, serializeJsonLd } from '@/lib/publicJsonLd';
import { getSiteUrl } from '@/lib/sitemap';

import browseStyles from '../../_styles/Browse.module.css';
import tagStyles from '../../_styles/Tags.module.css';

// Reads searchParams (type, page).
export const dynamic = 'force-dynamic';

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ type?: string; page?: string }>;
};

const PAGE_SIZE = 50;

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await getTagBySlug(slug);

  if (!resolved) {
    return { title: 'Tag not found' };
  }

  return {
    title: resolved.tag.name,
    description:
      resolved.tag.description ??
      `SynAc entries tagged “${resolved.tag.name}”.`,
    alternates: { canonical: `/tags/${resolved.canonicalSlug}` },
  };
}

function parseEntryType(
  value: string | undefined,
): 'TERM' | 'ACRONYM' | undefined {
  const upper = value?.toUpperCase();
  if (upper === 'TERM') return 'TERM';
  if (upper === 'ACRONYM') return 'ACRONYM';
  return undefined;
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const entryType = parseEntryType(sp.type);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const resolved = await getTagBySlug(slug);
  if (!resolved) notFound();

  if (resolved.needsRedirect) {
    permanentRedirect(`/tags/${resolved.canonicalSlug}`);
  }

  const { items, total } = await getTagEntries({
    tagId: resolved.tag.id,
    tagSlug: resolved.tag.slug,
    entryType,
    page,
    pageSize: PAGE_SIZE,
  });

  const siteUrl = getSiteUrl();
  const canonicalUrl = `${siteUrl}/tags/${resolved.tag.slug}`;

  const jsonLd = serializeJsonLd(
    buildTagJsonLd({
      url: canonicalUrl,
      name: resolved.tag.name,
      description: resolved.tag.description,
      terms: items.map((entry) => ({
        name: entry.displayTitle,
        url: `${siteUrl}${
          entry.entryType === 'TERM'
            ? `/term/${entry.primarySlug}`
            : `/acronym/${entry.primarySlug}`
        }`,
        description: entry.summaryText,
      })),
    }),
  );

  const baseHref = `/tags/${resolved.tag.slug}${
    entryType ? `?type=${encodeURIComponent(entryType)}` : ''
  }`;
  const pageHref = (target: number) =>
    `${baseHref}${entryType ? '&' : '?'}page=${target}`;

  const prevHref = page > 1 ? pageHref(page - 1) : undefined;
  const nextHref = page * PAGE_SIZE < total ? pageHref(page + 1) : undefined;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <PageHeader
        badge="Tag"
        title={resolved.tag.name}
        subtitle={
          resolved.tag.description ??
          'Published entries associated with this tag.'
        }
      />

      <nav className={tagStyles.filters} aria-label="Entry type filter">
        <Link
          className={`${tagStyles.chip} ${!entryType ? tagStyles.chipActive : ''}`}
          aria-current={!entryType ? 'page' : undefined}
          href={`/tags/${resolved.tag.slug}`}
        >
          All
        </Link>
        <Link
          className={`${tagStyles.chip} ${entryType === 'TERM' ? tagStyles.chipActive : ''}`}
          aria-current={entryType === 'TERM' ? 'page' : undefined}
          href={`/tags/${resolved.tag.slug}?type=TERM`}
        >
          Terms
        </Link>
        <Link
          className={`${tagStyles.chip} ${entryType === 'ACRONYM' ? tagStyles.chipActive : ''}`}
          aria-current={entryType === 'ACRONYM' ? 'page' : undefined}
          href={`/tags/${resolved.tag.slug}?type=ACRONYM`}
        >
          Acronyms
        </Link>
      </nav>

      {items.length === 0 ? (
        <EmptyState title="No entries yet">
          {entryType
            ? `No published ${entryType === 'TERM' ? 'terms' : 'acronyms'} carry this tag. Try the “All” filter.`
            : 'No published entries carry this tag yet.'}
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
    </>
  );
}
