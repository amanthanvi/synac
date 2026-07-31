import { api, getConvexClient } from '@/lib/convex';
import { TagDirectory } from '@/components/TagDirectory';
import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Tags.module.css';

export const revalidate = 900;

export default async function TagsPage() {
  const tags = await getConvexClient().query(api.tags.directory, {});

  return (
    <>
      <PageHeader
        badge="Browse"
        title="Tags"
        subtitle="Curated tags for browsing and filtering. The taxonomy is maintained in the open-source repository."
      />

      {tags.length === 0 ? (
        <div className={styles.empty}>No tags yet.</div>
      ) : (
        <TagDirectory
          tags={tags.map((tag) => ({
            id: tag.slug,
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
