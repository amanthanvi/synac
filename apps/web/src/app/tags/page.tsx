import { getPrismaClient, listTags } from '@synac/db';

import { TagDirectory } from '@/components/TagDirectory';
import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Tags.module.css';

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const prisma = getPrismaClient();
  const tags = await listTags(prisma);
  const counts = await prisma.entryTag.groupBy({
    by: ['tagId'],
    where: { tag: { deletedAt: null }, entry: { status: 'PUBLISHED', deletedAt: null } },
    _count: { tagId: true },
  });

  const countByTagId = new Map<string, number>();
  for (const row of counts) {
    countByTagId.set(row.tagId, row._count.tagId);
  }

  return (
    <>
      <PageHeader
        badge="Browse"
        title="Tags"
        subtitle="Curated tags for browsing and filtering. Some tags may be auto-applied based on entry text; tag pages preserve old slugs via redirects."
      />

      {tags.length === 0 ? (
        <div className={styles.empty}>No tags yet.</div>
      ) : (
        <TagDirectory
          tags={tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            description: tag.description,
            count: countByTagId.get(tag.id) ?? 0,
          }))}
        />
      )}
    </>
  );
}
