import Link from 'next/link';

import { getPrismaClient, listTags } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Tags.module.css';

export const dynamic = 'force-dynamic';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function TagsPage() {
  const prisma = getPrismaClient();
  const tags = await listTags(prisma);

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
        <ol className={styles.list}>
          {tags.map((tag) => (
            <li key={tag.id} className={styles.item}>
              <div className={styles.itemTitleRow}>
                <Link className={styles.itemTitle} href={`/tags/${tag.slug}`}>
                  {tag.name}
                </Link>
                <span className={styles.itemSlug}>Updated {formatDate(tag.updatedAt)}</span>
              </div>
              {tag.description ? (
                <p className={styles.itemDesc}>{tag.description}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
