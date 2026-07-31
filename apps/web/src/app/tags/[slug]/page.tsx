import Link from 'next/link';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';

import { getPrismaClient, listPublishedEntriesForTag, resolveTagBySlug } from '@synac/db';

import { formatDate } from '@/lib/dates';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import browseStyles from '../../_styles/Browse.module.css';
import tagStyles from '../../_styles/Tags.module.css';
import layoutStyles from '../../_styles/Layout.module.css';

export const revalidate = 300;

type TagPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ type?: string; page?: string }>;
};

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const resolved = await resolveTagBySlug(prisma, { slug });

  if (!resolved) {
    return { title: 'Tag not found' };
  }

  return {
    title: resolved.tag.name,
    description: resolved.tag.description ?? `SynAc entries tagged “${resolved.tag.name}”.`,
    alternates: { canonical: `/tags/${resolved.canonicalSlug}` },
  };
}

function parseEntryType(value: string | undefined): 'TERM' | 'ACRONYM' | undefined {
  const v = value?.toUpperCase();
  if (v === 'TERM') return 'TERM';
  if (v === 'ACRONYM') return 'ACRONYM';
  return undefined;
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const entryType = parseEntryType(sp.type);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 50;

  const prisma = getPrismaClient();
  const resolved = await resolveTagBySlug(prisma, { slug });

  if (!resolved) {
    return (
      <div className={layoutStyles.pageNarrow}>
        <PageHeader title="Tag not found" subtitle="This tag does not exist." />
        <div className={tagStyles.empty}>
          Try <Link href="/tags">all tags</Link>.
        </div>
      </div>
    );
  }

  if (resolved.needsRedirect) {
    permanentRedirect(`/tags/${resolved.canonicalSlug}`);
  }

  const entries = await listPublishedEntriesForTag(prisma, {
    tagId: resolved.tag.id,
    entryType,
    page,
    pageSize,
  });

  const baseHref = `/tags/${resolved.tag.slug}${
    entryType ? `?type=${encodeURIComponent(entryType)}` : ''
  }`;
  const prevHref =
    page > 1
      ? `${baseHref}${entryType ? '&' : '?'}page=${page - 1}`
      : undefined;
  const nextHref =
    entries.length === pageSize
      ? `${baseHref}${entryType ? '&' : '?'}page=${page + 1}`
      : undefined;

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title={resolved.tag.name}
        subtitle={resolved.tag.description ?? 'Published entries associated with this tag.'}
      />

      <nav className={tagStyles.filters} aria-label="Entry type filter">
        <Link
          className={`${tagStyles.chip} ${!entryType ? tagStyles.chipActive : ''}`}
          href={`/tags/${resolved.tag.slug}`}
        >
          All
        </Link>
        <Link
          className={`${tagStyles.chip} ${entryType === 'TERM' ? tagStyles.chipActive : ''}`}
          href={`/tags/${resolved.tag.slug}?type=TERM`}
        >
          Terms
        </Link>
        <Link
          className={`${tagStyles.chip} ${entryType === 'ACRONYM' ? tagStyles.chipActive : ''}`}
          href={`/tags/${resolved.tag.slug}?type=ACRONYM`}
        >
          Acronyms
        </Link>
      </nav>

      {entries.length === 0 ? (
        <div className={browseStyles.empty}>No published entries yet for this tag.</div>
      ) : (
        <>
          <EntryRowList>
            {entries.map((entry) => (
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
    </div>
  );
}
