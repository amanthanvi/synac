import Link from 'next/link';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';

import { getPrismaClient, listPublishedEntriesForTag, resolveTagBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import browseStyles from '../../_styles/Browse.module.css';
import tagStyles from '../../_styles/Tags.module.css';

export const dynamic = 'force-dynamic';

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
      <>
        <PageHeader badge="Tag" title="Not found" subtitle="This tag does not exist." />
        <div className={tagStyles.empty}>
          Try <Link href="/tags">all tags</Link>.
        </div>
      </>
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
    <>
      <PageHeader
        badge="Tag"
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
          <ol className={browseStyles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={browseStyles.item}>
                <div className={browseStyles.itemTitleRow}>
                  <Link
                    className={browseStyles.itemTitle}
                    href={
                      entry.entryType === 'TERM'
                        ? `/term/${entry.primarySlug}`
                        : `/acronym/${entry.primarySlug}`
                    }
                  >
                    {entry.displayTitle}
                  </Link>
                  <span className={browseStyles.itemSlug}>
                    /{entry.entryType === 'TERM' ? 'term' : 'acronym'}/{entry.primarySlug}
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
