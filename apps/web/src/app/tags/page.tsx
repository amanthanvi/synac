import { queryPublicConvex } from '@synac/db';

import { TagDirectory } from '@/components/TagDirectory';
import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Tags.module.css';
import layoutStyles from '../_styles/Layout.module.css';

export const revalidate = 900;

export default async function TagsPage() {
  const tags = await queryPublicConvex<
    Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      count: number;
      countIsApproximate?: boolean;
    }>
  >('listTagsWithCounts');

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Tags"
        subtitle="A curated taxonomy for browsing and filtering entries."
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
            countIsApproximate: tag.countIsApproximate,
          }))}
        />
      )}
    </div>
  );
}
