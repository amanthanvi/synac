import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { createSource } from '@/lib/adminSources';

export const dynamic = 'force-dynamic';

export default function AdminNewSourcePage() {
  return (
    <>
      <PageHeader badge="Admin" title="New source" subtitle="Create a source registry entry." />

      <form action={create} style={{ maxWidth: 760, marginTop: 14, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Name</div>
          <input name="name" placeholder="e.g., MITRE ATT&CK" required />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Source slug</div>
          <input name="sourceSlug" placeholder="e.g., mitre-attack" required />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Base URL (https)</div>
          <input name="baseUrl" placeholder="https://attack.mitre.org" required />
        </label>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>License type</div>
            <select name="licenseType" defaultValue="OTHER" required>
              <option value="PUBLIC_DOMAIN">PUBLIC_DOMAIN</option>
              <option value="CC_BY_4_0">CC_BY_4_0</option>
              <option value="CC_BY_SA_4_0">CC_BY_SA_4_0</option>
              <option value="CC0_1_0">CC0_1_0</option>
              <option value="PROPRIETARY">PROPRIETARY</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Trust tier</div>
            <select name="trustTier" defaultValue="TIER_4" required>
              <option value="TIER_1">TIER_1</option>
              <option value="TIER_2">TIER_2</option>
              <option value="TIER_3">TIER_3</option>
              <option value="TIER_4">TIER_4</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Access method</div>
            <select name="accessMethod" defaultValue="OTHER" required>
              <option value="API">API</option>
              <option value="RSS">RSS</option>
              <option value="HTML">HTML</option>
              <option value="PDF">PDF</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Robots policy</div>
            <select name="robotsPolicy" defaultValue="RESPECT" required>
              <option value="RESPECT">RESPECT</option>
              <option value="EXPLICIT_PERMISSION">EXPLICIT_PERMISSION</option>
            </select>
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Allowed use (verified)</div>
          <textarea
            name="allowedUse"
            required
            rows={3}
            placeholder="Describe restrictions for quoting/summarizing/paraphrasing."
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Attribution requirements (verified)</div>
          <textarea
            name="attributionRequirements"
            required
            rows={3}
            placeholder="What must we display (template text, links, notices)?"
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>License notes (optional)</div>
          <textarea name="licenseNotes" rows={2} />
        </label>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Last verified at (optional)</div>
            <input name="lastVerifiedAt" type="date" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Ingest cron (optional, UTC)</div>
            <input name="cronSchedule" placeholder="e.g., 0 3 * * *" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Contact (optional)</div>
            <input name="contact" placeholder="email or form URL" />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Rate limit policy JSON (optional)</div>
          <textarea
            name="rateLimitPolicy"
            rows={2}
            placeholder='e.g. {"requestsPerMinute":60,"concurrency":2}'
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Internal notes (optional)</div>
          <textarea name="notesInternal" rows={2} />
        </label>

        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input name="enabled" type="checkbox" />
          <div style={{ opacity: 0.85 }}>
            Enabled (requires <code>lastVerifiedAt</code>)
          </div>
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit">Create source</button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>You can keep it disabled until verification is complete.</div>
        </div>
      </form>
    </>
  );
}

async function create(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage sources');
  }

  const { sourceId } = await createSource({
    actorUserId: actor.dbUserId,
    name: String(formData.get('name') ?? ''),
    sourceSlug: String(formData.get('sourceSlug') ?? ''),
    baseUrl: String(formData.get('baseUrl') ?? ''),
    cronSchedule: String(formData.get('cronSchedule') ?? ''),
    licenseType: String(formData.get('licenseType') ?? ''),
    licenseNotes: String(formData.get('licenseNotes') ?? ''),
    allowedUse: String(formData.get('allowedUse') ?? ''),
    attributionRequirements: String(formData.get('attributionRequirements') ?? ''),
    accessMethod: String(formData.get('accessMethod') ?? ''),
    robotsPolicy: String(formData.get('robotsPolicy') ?? ''),
    rateLimitPolicy: String(formData.get('rateLimitPolicy') ?? ''),
    contact: String(formData.get('contact') ?? ''),
    lastVerifiedAt: String(formData.get('lastVerifiedAt') ?? ''),
    trustTier: String(formData.get('trustTier') ?? ''),
    enabled: Boolean(formData.get('enabled')),
    notesInternal: String(formData.get('notesInternal') ?? ''),
  });

  redirect(`/admin/sources/${sourceId}`);
}
