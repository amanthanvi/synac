import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { createTag } from '@/lib/adminTags';

export const dynamic = 'force-dynamic';

export default function AdminNewTagPage() {
  return (
    <>
      <PageHeader badge="Admin" title="New tag" subtitle="Create a curated tag for entry browsing." />

      <div style={{ marginTop: 10 }}>
        <Link href="/admin/tags">Back to tags</Link>
      </div>

      <form action={create} style={{ marginTop: 14, display: 'grid', gap: 12, maxWidth: 720 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Name</div>
          <input name="name" required placeholder="e.g., Identity" />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Slug (optional)</div>
          <input name="slug" placeholder="identity" />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Description (optional)</div>
          <textarea name="description" rows={3} placeholder="Shown on public tag page." />
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit">Create</button>
        </div>
      </form>
    </>
  );
}

async function create(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can create tags');
  }

  const name = String(formData.get('name') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const description = String(formData.get('description') ?? '');

  const { tagId } = await createTag({
    actorUserId: actor.dbUserId,
    name,
    slug: slug.trim() ? slug : null,
    description: description.trim() ? description : null,
  });

  redirect(`/admin/tags/${tagId}?created=1`);
}

