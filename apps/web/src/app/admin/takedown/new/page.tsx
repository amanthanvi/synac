import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { createTakedownCase } from '@/lib/adminTakedown';

export const dynamic = 'force-dynamic';

export default function AdminNewTakedownCasePage() {
  return (
    <>
      <PageHeader badge="Admin" title="New takedown case" subtitle="Create a case record before taking action." />

      <form action={create} style={{ maxWidth: 860, marginTop: 14, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Status</div>
          <select name="status" defaultValue="OPEN" required>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </label>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Source ID (optional)</div>
            <input name="sourceId" placeholder="UUID" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>SourceDocument ID (optional)</div>
            <input name="sourceDocumentId" placeholder="UUID" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Entry ID (optional)</div>
            <input name="entryId" placeholder="UUID" />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Requester contact (optional)</div>
          <input name="requesterContact" placeholder="email, ticket, or URL" />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Request text</div>
          <textarea name="requestText" rows={6} required placeholder="What are they requesting, and why?" />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Internal notes (optional)</div>
          <textarea name="internalNotes" rows={4} placeholder="Links, context, and planned actions." />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit">Create case</button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Only admins can execute takedown actions.</div>
        </div>
      </form>
    </>
  );
}

async function create(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage takedown');
  }

  const { takedownCaseId } = await createTakedownCase({
    actorUserId: actor.dbUserId,
    status: String(formData.get('status') ?? 'OPEN') as 'OPEN' | 'IN_PROGRESS' | 'CLOSED',
    sourceId: String(formData.get('sourceId') ?? ''),
    sourceDocumentId: String(formData.get('sourceDocumentId') ?? ''),
    entryId: String(formData.get('entryId') ?? ''),
    requesterContact: String(formData.get('requesterContact') ?? ''),
    requestText: String(formData.get('requestText') ?? ''),
    internalNotes: String(formData.get('internalNotes') ?? ''),
  });

  redirect(`/admin/takedown/${takedownCaseId}`);
}

