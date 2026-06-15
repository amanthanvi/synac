import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { mergeTags, updateTag } from '@/lib/adminTags';

export const dynamic = 'force-dynamic';

type AdminTagPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ created?: string; saved?: string; merged?: string }>;
};

export default async function AdminTagPage({ params, searchParams }: AdminTagPageProps) {
  await requireAdminActor();

  const { id } = await params;
  const qp = (await searchParams) ?? {};

  const prisma = getPrismaClient();
  const tag = await prisma.tag.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      updatedAt: true,
      slugHistory: { select: { slug: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }], take: 50 },
      _count: { select: { entryTags: true } },
    },
  });

  if (!tag) notFound();

  const otherTags = await prisma.tag.findMany({
    where: { deletedAt: null, NOT: { id: tag.id } },
    select: { id: true, name: true, slug: true },
    orderBy: [{ name: 'asc' }],
    take: 2000,
  });

  return (
    <>
      <PageHeader
        badge="Admin"
        title={tag.name}
        subtitle={`/${tag.slug} · ${tag._count.entryTags} entries`}
      />

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/tags">Back to tags</Link>
        <Link href={`/tags/${tag.slug}`}>Open public tag</Link>
      </div>

      {qp.created ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Created.</div>
      ) : qp.saved ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Saved.</div>
      ) : qp.merged ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Merged.</div>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Fields</h2>
        <form action={save} style={{ marginTop: 12, display: 'grid', gap: 12, maxWidth: 720 }}>
          <input type="hidden" name="tagId" value={tag.id} />

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Name</div>
            <input name="name" defaultValue={tag.name} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Slug</div>
            <input name="slug" defaultValue={tag.slug} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Description</div>
            <textarea name="description" defaultValue={tag.description ?? ''} rows={3} />
          </label>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="submit">Save</button>
            <span style={{ opacity: 0.7, fontSize: 12 }}>Updated at {tag.updatedAt.toISOString()}</span>
          </div>
        </form>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Merge</h2>
        <div style={{ marginTop: 8, opacity: 0.8 }}>
          Moves all entry associations and redirects this slug + history to the target tag.
        </div>

        {otherTags.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>No other tags to merge into.</div>
        ) : (
          <form action={merge} style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input type="hidden" name="fromTagId" value={tag.id} />
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Into</span>
              <select name="intoTagId" required defaultValue={otherTags[0]?.id}>
                {otherTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </label>

            <div style={{ alignSelf: 'end' }}>
              <button type="submit">Merge</button>
            </div>
          </form>
        )}
      </section>

      {tag.slugHistory.length ? (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Slug history</h2>
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.8, opacity: 0.85 }}>
            {tag.slugHistory.map((h) => (
              <li key={`${h.slug}-${h.createdAt.toISOString()}`}>{h.slug}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

async function save(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can edit tags');
  }

  const tagId = String(formData.get('tagId') ?? '');
  const name = String(formData.get('name') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const description = String(formData.get('description') ?? '');

  await updateTag({
    actorUserId: actor.dbUserId,
    tagId,
    name,
    slug,
    description: description.trim() ? description : null,
  });

  redirect(`/admin/tags/${tagId}?saved=1`);
}

async function merge(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can merge tags');
  }

  const fromTagId = String(formData.get('fromTagId') ?? '');
  const intoTagId = String(formData.get('intoTagId') ?? '');

  await mergeTags({ actorUserId: actor.dbUserId, fromTagId, intoTagId });

  redirect(`/admin/tags/${intoTagId}?merged=1`);
}
