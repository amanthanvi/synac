import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { readTag, readTagEntries, readTagResolution } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { buildTagJsonLd, renderJsonLd } from '@/lib/jsonLd';
import { getSiteUrl } from '@/lib/sitemap';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import {
  nextTagPagePath,
  parseTagEntryType,
  parseTagPage,
  tagPagePath,
} from '@/lib/tagRouting';

import tagStyles from '../../_styles/Tags.module.css';
import layoutStyles from '../../_styles/Layout.module.css';

export const revalidate = 300;

const PAGE_SIZE = 50;

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ type?: string; page?: string }>;
};

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await readTagResolution(slug);

  if (resolution?.kind === 'RETIRED') {
    return { title: 'Retired tag', robots: { index: false, follow: true } };
  }
  if (!resolution) return { title: 'Tag not found' };

  const tag = await readTag(resolution.slug);
  if (!tag) return { title: 'Tag not found' };

  const description = tag.description ?? `SynAc entries tagged "${tag.name}".`;

  return {
    title: tag.name,
    description,
    alternates: { canonical: `/tags/${tag.slug}` },
    openGraph: { title: tag.name, description, images: '/opengraph-image.png' },
    twitter: {
      card: 'summary_large_image',
      title: tag.name,
      description,
      images: '/twitter-image.png',
    },
  };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const entryType = parseTagEntryType(sp.type);
  const page = parseTagPage(sp.page);

  const resolution = await readTagResolution(slug);
  if (!resolution) notFound();
  if (resolution.kind === 'REDIRECT') {
    permanentRedirect(tagPagePath(resolution.slug, entryType, page));
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

  const tag = await readTag(resolution.slug);
  if (!tag) notFound();

  const { entries, hasMore } = await readTagEntries(
    tag.slug,
    entryType ?? null,
    page,
    PAGE_SIZE,
  );

  const siteUrl = getSiteUrl();
  const jsonLd = renderJsonLd(
    buildTagJsonLd({
      url: `${siteUrl}/tags/${tag.slug}`,
      name: tag.name,
      description: tag.description,
      terms: entries.map((entry) => ({
        name: entry.title,
        description: entry.summaryText,
        url: `${siteUrl}${entry.entryType === 'TERM' ? '/term' : '/acronym'}/${entry.slug}`,
      })),
    }),
  );

  const filters: Array<{
    label: string;
    type: 'TERM' | 'ACRONYM' | undefined;
  }> = [
    { label: 'All', type: undefined },
    { label: 'Terms', type: 'TERM' },
    { label: 'Acronyms', type: 'ACRONYM' },
  ];

  return (
    <div className={layoutStyles.pageNarrow}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <PageHeader
        title={tag.name}
        subtitle={
          tag.description ?? 'Published entries associated with this tag.'
        }
      />

      <nav className={tagStyles.filters} aria-label="Entry type filter">
        {filters.map((filter) => {
          const active = filter.type === entryType;
          return (
            <Link
              key={filter.label}
              className={`${tagStyles.chip} ${active ? tagStyles.chipActive : ''}`}
              aria-current={active ? 'true' : undefined}
              href={tagPagePath(tag.slug, filter.type, 1)}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {entries.length === 0 ? (
        <div className={tagStyles.empty}>
          No published entries yet for this tag.
        </div>
      ) : (
        <>
          <EntryRowList>
            {entries.map((entry) => (
              <EntryRow
                key={entry.key}
                href={`${entry.entryType === 'TERM' ? '/term' : '/acronym'}/${entry.slug}`}
                title={entry.title}
                entryType={entry.entryType}
                summary={entry.summaryText}
                meta={`Updated ${formatDate(new Date(entry.updatedAt))}`}
              />
            ))}
          </EntryRowList>
          <Pagination
            page={page}
            prevHref={
              page > 1 ? tagPagePath(tag.slug, entryType, page - 1) : undefined
            }
            nextHref={nextTagPagePath(tag.slug, entryType, page, hasMore)}
          />
        </>
      )}
    </div>
  );
}
