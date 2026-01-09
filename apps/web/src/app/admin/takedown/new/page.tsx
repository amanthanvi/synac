import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';
import { createTakedownCase } from '@/lib/adminTakedown';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function AdminNewTakedownCasePage() {
  return (
      <>
      <PageHeader badge="Admin" title="New takedown case" subtitle="Create a case record before taking action." />

      <form action={create} className={styles.form}>
        <label className={styles.field}>
          <div className={styles.label}>Status</div>
          <select className={styles.select} name="status" defaultValue="OPEN" required>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </label>

        <div className={styles.grid}>
          <label className={styles.field}>
            <div className={styles.label}>Source ID (optional)</div>
            <input className={styles.input} name="sourceId" placeholder="UUID" />
          </label>

          <label className={styles.field}>
            <div className={styles.label}>SourceDocument ID (optional)</div>
            <input className={styles.input} name="sourceDocumentId" placeholder="UUID" />
          </label>

          <label className={styles.field}>
            <div className={styles.label}>Entry ID (optional)</div>
            <input className={styles.input} name="entryId" placeholder="UUID" />
          </label>
        </div>

        <label className={styles.field}>
          <div className={styles.label}>Requester contact (optional)</div>
          <input className={styles.input} name="requesterContact" placeholder="email, ticket, or URL" />
        </label>

        <label className={styles.field}>
          <div className={styles.label}>Request text</div>
          <textarea
            className={styles.textarea}
            name="requestText"
            rows={6}
            required
            placeholder="What are they requesting, and why?"
          />
        </label>

        <label className={styles.field}>
          <div className={styles.label}>Internal notes (optional)</div>
          <textarea
            className={styles.textarea}
            name="internalNotes"
            rows={4}
            placeholder="Links, context, and planned actions."
          />
        </label>

        <div className={styles.buttonRow}>
          <Button type="submit" variant="primary" size="sm">
            Create case
          </Button>
          <div className={styles.note}>Only admins can execute takedown actions.</div>
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
