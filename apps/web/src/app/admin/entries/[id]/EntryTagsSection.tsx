import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { Button } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';
import { addTagToEntry, removeTagFromEntry } from '@/lib/adminEntryTags';

import styles from './page.module.css';

export async function EntryTagsSection(props: {
  entryId: string;
  entryTags: Array<{ tagId: string; tag: { id: string; name: string; slug: string } }>;
}) {
  await requireAdminActor();

  const prisma = getPrismaClient();
  const allTags = await prisma.tag.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: [{ name: 'asc' }],
    take: 2000,
  });

  const currentTagIds = new Set(props.entryTags.map((t) => t.tagId));
  const availableTags = allTags.filter((t) => !currentTagIds.has(t.id));

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Tags ({props.entryTags.length})</h2>

      {props.entryTags.length === 0 ? (
        <div className={styles.notice}>
          No tags yet. Tags power public browsing on <code>/tags/&hellip;</code>.
        </div>
      ) : (
        <ul className={styles.tagList}>
          {props.entryTags.map(({ tag }) => (
            <li key={tag.id} className={styles.tagItem}>
              <div className={styles.tagMain}>
                <Link className={styles.tagName} href={`/admin/tags/${tag.id}`}>
                  {tag.name}
                </Link>
                <span className={styles.tagSlug}>{tag.slug}</span>
              </div>
              <div className={styles.tagActions}>
                <Link className={styles.inlineLink} href={`/tags/${tag.slug}`}>
                  Public
                </Link>
                <form action={removeTagAction}>
                  <input type="hidden" name="entryId" value={props.entryId} />
                  <input type="hidden" name="tagId" value={tag.id} />
                  <button type="submit" className={styles.inlineButton}>
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {availableTags.length === 0 ? (
        <div className={styles.notice}>No more tags to add.</div>
      ) : (
        <form action={addTagAction} className={styles.addTagForm}>
          <input type="hidden" name="entryId" value={props.entryId} />
          <label className={styles.field}>
            <div className={styles.label}>Add tag</div>
            <select className={styles.input} name="tagId" required defaultValue={availableTags[0]?.id}>
              {availableTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" size="sm">
            Add tag
          </Button>
        </form>
      )}
    </section>
  );
}

async function addTagAction(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const entryId = String(formData.get('entryId') ?? '');
  const tagId = String(formData.get('tagId') ?? '');

  await addTagToEntry({ actorUserId: actor.dbUserId, entryId, tagId });
  redirect(`/admin/entries/${entryId}?saved=1`);
}

async function removeTagAction(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const entryId = String(formData.get('entryId') ?? '');
  const tagId = String(formData.get('tagId') ?? '');

  await removeTagFromEntry({ actorUserId: actor.dbUserId, entryId, tagId });
  redirect(`/admin/entries/${entryId}?saved=1`);
}
