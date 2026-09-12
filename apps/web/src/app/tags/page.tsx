import type { Metadata } from 'next';

import { readTagDirectory } from '@/lib/convex';
import { TagDirectory } from '@/components/TagDirectory';
import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Tags.module.css';
import layoutStyles from '../_styles/Layout.module.css';

export const revalidate = 900;

const title = 'Tags';
const description =
  'The curated SynAc taxonomy: browse cybersecurity terms and acronyms by subject.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/tags' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default async function TagsPage() {
  const tags = await readTagDirectory();

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Tags"
        subtitle="Curated tags for browsing and filtering. The taxonomy is maintained in the open-source repository."
      />

      {tags.length === 0 ? (
        <div className={styles.empty}>No tags yet.</div>
      ) : (
        <TagDirectory
          tags={tags.map((tag) => ({
            name: tag.name,
            slug: tag.slug,
            description: tag.description,
            count: tag.entryCount,
            editorialCount: tag.editorialCount,
            autoCount: tag.autoCount,
          }))}
        />
      )}
    </div>
  );
}
