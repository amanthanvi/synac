import { PageHeader } from '@/components/PageHeader';
import { getPrismaClient } from '@synac/db';

export const dynamic = 'force-dynamic';

type AdminAuditPageProps = {
  searchParams?: Promise<{
    entityType?: string;
    entityId?: string;
    action?: string;
    actorEmail?: string;
  }>;
};

function normalizeOptional(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const qp = searchParams ? await searchParams : {};
  const entityType = normalizeOptional(qp.entityType);
  const entityId = normalizeOptional(qp.entityId);
  const action = normalizeOptional(qp.action);
  const actorEmail = normalizeOptional(qp.actorEmail)?.toLowerCase();

  const prisma = getPrismaClient();
  const events = await prisma.auditEvent.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(actorEmail
        ? {
            actorUser: {
              email: actorEmail,
            },
          }
        : {}),
    },
    include: {
      actorUser: { select: { email: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });

  const senseIds = events.filter((ev) => ev.entityType === 'SENSE').map((ev) => ev.entityId);
  const senseToEntry = new Map<string, string>();
  if (senseIds.length > 0) {
    const senses = await prisma.sense.findMany({
      where: { id: { in: senseIds }, deletedAt: null },
      select: { id: true, entryId: true },
    });
    for (const sense of senses) senseToEntry.set(sense.id, sense.entryId);
  }

  return (
    <>
      <PageHeader badge="Admin" title="Audit" subtitle="Recent changes and rollback points." />

      <form style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Entity type</span>
          <input
            name="entityType"
            defaultValue={entityType ?? ''}
            placeholder="ENTRY | SENSE | TAG | SOURCE ..."
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Entity ID</span>
          <input name="entityId" defaultValue={entityId ?? ''} placeholder="UUID" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Action</span>
          <input name="action" defaultValue={action ?? ''} placeholder="ENTRY_PUBLISH" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Actor email</span>
          <input name="actorEmail" defaultValue={actorEmail ?? ''} placeholder="you@domain.com" />
        </label>
        <button type="submit">Filter</button>
      </form>

      {events.length === 0 ? (
        <div style={{ marginTop: 18, opacity: 0.8, lineHeight: 1.7 }}>No audit events found.</div>
      ) : (
        <div style={{ marginTop: 18, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['When', 'Actor', 'Action', 'Entity', 'Rollback'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      opacity: 0.75,
                      borderBottom: '1px solid var(--border)',
                      padding: '10px 8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const entryId = ev.entityType === 'ENTRY' ? ev.entityId : senseToEntry.get(ev.entityId);
                const adminHref = entryId ? `/admin/entries/${entryId}` : undefined;
                const canRollback = Boolean(ev.before) && ev.action !== 'ENTRY_CREATE';

                return (
                  <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
                        {formatDate(ev.createdAt)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.85 }}>
                        {ev.actorUser.email}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ev.action}</span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {adminHref ? (
                        <a href={adminHref}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {ev.entityType}:{ev.entityId}
                          </span>
                        </a>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {ev.entityType}:{ev.entityId}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: canRollback ? 1 : 0.6 }}>
                        {canRollback ? 'Available' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
