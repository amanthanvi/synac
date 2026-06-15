import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { getPrismaClient } from '@synac/db';

import { Button } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';

import styles from './page.module.css';

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
  await requireAdminActor();

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

      <form className={styles.filterForm}>
        <label className={styles.field}>
          <span className={styles.label}>Entity type</span>
          <input
            className={styles.input}
            name="entityType"
            defaultValue={entityType ?? ''}
            placeholder="ENTRY | SENSE | TAG | SOURCE ..."
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Entity ID</span>
          <input className={styles.input} name="entityId" defaultValue={entityId ?? ''} placeholder="UUID" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Action</span>
          <input className={styles.input} name="action" defaultValue={action ?? ''} placeholder="ENTRY_PUBLISH" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Actor email</span>
          <input
            className={styles.input}
            name="actorEmail"
            defaultValue={actorEmail ?? ''}
            placeholder="you@domain.com"
          />
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>

      {events.length === 0 ? (
        <div className={styles.empty}>No audit events found.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {['When', 'Actor', 'Action', 'Entity', 'Rollback'].map((h) => (
                  <th key={h} className={styles.th}>
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
                  <tr key={ev.id} className={styles.row}>
                    <td className={styles.td}>
                      <span className={styles.monoStrong}>{formatDate(ev.createdAt)}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.monoStrong}>{ev.actorUser.email}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.mono}>{ev.action}</span>
                    </td>
                    <td className={styles.td}>
                      {adminHref ? (
                        <Link className={styles.link} href={adminHref}>
                          <span className={styles.mono}>
                            {ev.entityType}:{ev.entityId}
                          </span>
                        </Link>
                      ) : (
                        <span className={styles.mono}>
                          {ev.entityType}:{ev.entityId}
                        </span>
                      )}
                    </td>
                    <td className={styles.td}>
                      <span
                        className={`${styles.mono} ${canRollback ? styles.rollbackAvailable : styles.rollbackUnavailable}`}
                      >
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
