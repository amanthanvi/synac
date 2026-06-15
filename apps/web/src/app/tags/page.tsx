import { queryPublicConvex } from '@synac/db';

import { TagDirectory } from '@/components/TagDirectory';
import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Tags.module.css';

export const revalidate = 900;

export default async function TagsPage() {
  const tags = await queryPublicConvex<
    Array<{ id: string; name: string; slug: string; description: string | null; count: number }>
  >('listTagsWithCounts');

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
            count: tag.count,
          }))}
        />
      )}
    </>
  );
}
