import type { Metadata } from 'next';

import { TagDirectory } from '@/components/TagDirectory';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getTagDirectory } from '@/lib/publicData';

// DB-backed with no searchParams. Kept dynamic because `next build` runs in
// environments without DATABASE_URL (e.g. the CodeQL workflow), so this route
// must not be prerendered. Freshness still comes from the `unstable_cache`
// tags in lib/publicData.ts, which `revalidateTag` invalidates on publish.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tags',
  description: 'Curated tags for browsing and filtering SynAc entries.',
  alternates: { canonical: '/tags' },
};

export default async function TagsPage() {
  const tags = await getTagDirectory();

  return (
    <>
      <PageHeader
        badge="Browse"
        title="Tags"
        subtitle="Curated tags for browsing and filtering. Some tags may be auto-applied based on entry text; tag pages preserve old slugs via redirects."
      />

      {tags.length === 0 ? (
        <EmptyState title="No tags yet">
          Tags appear here once entries have been categorised.
        </EmptyState>
      ) : (
        <TagDirectory
          tags={tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            description: tag.description,
            count: tag.entryCount,
          }))}
        />
      )}
    </>
  );
}
