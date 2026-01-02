import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { createDraftEntry } from '@/lib/adminEntries';

export const dynamic = 'force-dynamic';

export default function AdminNewEntryPage() {
  return (
    <>
      <PageHeader
        badge="Admin"
        title="New entry"
        subtitle="Create a draft entry. You can add senses + references before publishing."
      />

      <form action={create} style={{ maxWidth: 720, marginTop: 14, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Entry type</div>
          <select name="entryType" defaultValue="TERM" required>
            <option value="TERM">TERM</option>
            <option value="ACRONYM">ACRONYM</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Display title</div>
          <input name="displayTitle" placeholder="e.g., Security Operations Center" required />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Slug (optional)</div>
          <input name="primarySlug" placeholder="e.g., security-operations-center" />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit">Create draft</button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Slug collisions auto-suffix with <code>-2</code>, <code>-3</code>, …
          </div>
        </div>
      </form>
    </>
  );
}

async function create(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const entryTypeRaw = String(formData.get('entryType') ?? '').toUpperCase();
  const entryType = entryTypeRaw === 'ACRONYM' ? 'ACRONYM' : 'TERM';

  const displayTitle = String(formData.get('displayTitle') ?? '');
  const primarySlug = String(formData.get('primarySlug') ?? '');

  const { entryId } = await createDraftEntry({
    actorUserId: actor.dbUserId,
    entryType,
    displayTitle,
    primarySlug: primarySlug.trim() ? primarySlug : undefined,
  });

  redirect(`/admin/entries/${entryId}`);
}

