import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { setSourceEnabled, updateSource } from '@/lib/adminSources';

export const dynamic = 'force-dynamic';

type AdminSourcePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; enabled?: string; disabled?: string }>;
};

function formatDateInput(value: Date | null): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

export default async function AdminSourcePage({ params, searchParams }: AdminSourcePageProps) {
  const { id } = await params;
  const qp = searchParams ? await searchParams : {};

  const prisma = getPrismaClient();
  const source = await prisma.source.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      baseUrl: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      accessMethod: true,
      robotsPolicy: true,
      rateLimitPolicy: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      notesInternal: true,
      updatedAt: true,
    },
  });

  if (!source) notFound();

  return (
    <>
      <PageHeader badge="Admin" title={source.name} subtitle="Edit source registry metadata." />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
          {source.enabled ? 'ENABLED' : 'DISABLED'} · {source.trustTier} · {source.licenseType}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
          · slug <code>{source.sourceSlug}</code>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
          · updated {source.updatedAt.toISOString().slice(0, 10)}
        </span>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href={`/sources/${source.sourceSlug}`}>Public page</Link>
        <Link href="/admin/sources">All sources</Link>
      </div>

      {qp.saved ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Saved.</div>
      ) : qp.enabled ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Enabled.</div>
      ) : qp.disabled ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Disabled.</div>
      ) : null}

      <form action={save} style={{ maxWidth: 860, marginTop: 16, display: 'grid', gap: 12 }}>
        <input type="hidden" name="sourceId" value={source.id} />

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Name</div>
          <input name="name" defaultValue={source.name} required />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Source slug</div>
          <input name="sourceSlug" defaultValue={source.sourceSlug} required />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Base URL (https)</div>
          <input name="baseUrl" defaultValue={source.baseUrl} required />
        </label>

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>License type</div>
            <select name="licenseType" defaultValue={source.licenseType} required>
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
            <select name="trustTier" defaultValue={source.trustTier} required>
              <option value="TIER_1">TIER_1</option>
              <option value="TIER_2">TIER_2</option>
              <option value="TIER_3">TIER_3</option>
              <option value="TIER_4">TIER_4</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Access method</div>
            <select name="accessMethod" defaultValue={source.accessMethod} required>
              <option value="API">API</option>
              <option value="RSS">RSS</option>
              <option value="HTML">HTML</option>
              <option value="PDF">PDF</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Robots policy</div>
            <select name="robotsPolicy" defaultValue={source.robotsPolicy} required>
              <option value="RESPECT">RESPECT</option>
              <option value="EXPLICIT_PERMISSION">EXPLICIT_PERMISSION</option>
            </select>
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Allowed use (verified)</div>
          <textarea name="allowedUse" defaultValue={source.allowedUse} required rows={3} />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Attribution requirements (verified)</div>
          <textarea
            name="attributionRequirements"
            defaultValue={source.attributionRequirements}
            required
            rows={3}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>License notes (optional)</div>
          <textarea name="licenseNotes" defaultValue={source.licenseNotes ?? ''} rows={2} />
        </label>

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Last verified at</div>
            <input name="lastVerifiedAt" type="date" defaultValue={formatDateInput(source.lastVerifiedAt)} />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Contact (optional)</div>
            <input name="contact" defaultValue={source.contact ?? ''} />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Rate limit policy JSON (optional)</div>
          <textarea
            name="rateLimitPolicy"
            defaultValue={source.rateLimitPolicy ? JSON.stringify(source.rateLimitPolicy) : ''}
            rows={2}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Internal notes (optional)</div>
          <textarea name="notesInternal" defaultValue={source.notesInternal ?? ''} rows={2} />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit">Save</button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Enabling requires <code>lastVerifiedAt</code>.
          </div>
        </div>
      </form>

      <form
        action={toggleEnabled}
        style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <input type="hidden" name="sourceId" value={source.id} />
        <input type="hidden" name="enabled" value={source.enabled ? '0' : '1'} />
        <button type="submit">{source.enabled ? 'Disable source' : 'Enable source'}</button>
      </form>
    </>
  );
}

async function save(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage sources');
  }

  const sourceId = String(formData.get('sourceId') ?? '');
  await updateSource({
    actorUserId: actor.dbUserId,
    sourceId,
    name: String(formData.get('name') ?? ''),
    sourceSlug: String(formData.get('sourceSlug') ?? ''),
    baseUrl: String(formData.get('baseUrl') ?? ''),
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
    notesInternal: String(formData.get('notesInternal') ?? ''),
  });

  redirect(`/admin/sources/${sourceId}?saved=1`);
}

async function toggleEnabled(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage sources');
  }

  const sourceId = String(formData.get('sourceId') ?? '');
  const enabled = String(formData.get('enabled') ?? '') === '1';

  await setSourceEnabled({
    actorUserId: actor.dbUserId,
    sourceId,
    enabled,
  });

  redirect(`/admin/sources/${sourceId}?${enabled ? 'enabled' : 'disabled'}=1`);
}
