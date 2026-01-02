import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { requireAdminActor } from '@/lib/admin';
import { addTagToEntry, removeTagFromEntry } from '@/lib/adminEntryTags';

export async function EntryTagsSection(props: {
  entryId: string;
  entryTags: Array<{ tagId: string; tag: { id: string; name: string; slug: string } }>;
}) {
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
    <section style={{ marginTop: 22 }}>
      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
        Tags ({props.entryTags.length})
      </h2>

      {props.entryTags.length === 0 ? (
        <div style={{ marginTop: 12, opacity: 0.8 }}>
          No tags yet. Tags power public browsing on `/tags/...`.
        </div>
      ) : (
        <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.8 }}>
          {props.entryTags.map(({ tag }) => (
            <li key={tag.id}>
              <Link href={`/admin/tags/${tag.id}`}>{tag.name}</Link>{' '}
              <span style={{ opacity: 0.8 }}>· {tag.slug}</span>{' '}
              <Link href={`/tags/${tag.slug}`}>Public</Link>
              <form action={removeTagAction} style={{ display: 'inline', marginLeft: 10 }}>
                <input type="hidden" name="entryId" value={props.entryId} />
                <input type="hidden" name="tagId" value={tag.id} />
                <button type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {availableTags.length === 0 ? (
        <div style={{ marginTop: 12, opacity: 0.8 }}>No more tags to add.</div>
      ) : (
        <form action={addTagAction} style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input type="hidden" name="entryId" value={props.entryId} />
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Add</span>
            <select name="tagId" required defaultValue={availableTags[0]?.id}>
              {availableTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button type="submit">Add tag</button>
          </div>
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

