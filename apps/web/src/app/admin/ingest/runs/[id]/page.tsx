import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';
import { approveIngestItem, rejectIngestItem } from '@/lib/adminIngest';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type AdminIngestRunPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ approved?: string; rejected?: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function getProposedTitle(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return typeof v.displayTitle === 'string' ? v.displayTitle : null;
}

function getAppliedEntryId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return typeof v.appliedEntryId === 'string' ? v.appliedEntryId : null;
}

function getMatchedEntryId(stageOutputs: unknown): string | null {
  if (!stageOutputs || typeof stageOutputs !== 'object') return null;
  const v = stageOutputs as Record<string, unknown>;
  const deduped = v.deduped;
  if (!deduped || typeof deduped !== 'object') return null;
  const d = deduped as Record<string, unknown>;
  return typeof d.matchedEntryId === 'string' ? d.matchedEntryId : null;
}

function getExtractedText(stageOutputs: unknown): string | null {
  if (!stageOutputs || typeof stageOutputs !== 'object') return null;
  const v = stageOutputs as Record<string, unknown>;
  const extracted = v.extracted;
  if (!extracted || typeof extracted !== 'object') return null;
  const e = extracted as Record<string, unknown>;
  const def = e.definitionMd;
  if (typeof def === 'string' && def.trim()) return def.trim();
  const overview = e.overviewMd;
  if (typeof overview === 'string' && overview.trim()) return overview.trim();
  const desc = e.descriptionMd;
  if (typeof desc === 'string' && desc.trim()) return desc.trim();
  return null;
}

export default async function AdminIngestRunPage({ params, searchParams }: AdminIngestRunPageProps) {
  await requireAdminActor();

  const { id } = await params;
  const qp = searchParams ? await searchParams : {};

  const prisma = getPrismaClient();
  const run = await prisma.ingestRun.findFirst({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      source: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          stage: true,
          licenseGate: true,
          licenseGateReason: true,
          confidenceScore: true,
          error: true,
          proposedChange: true,
          stageOutputs: true,
          diff: true,
          sourceDocument: { select: { url: true, canonicalUrl: true } },
        },
        orderBy: [{ stage: 'asc' }, { id: 'asc' }],
        take: 200,
      },
    },
  });

  if (!run) notFound();

  return (
    <>
      <PageHeader
        badge="Admin"
        title={`Ingest run ${run.id}`}
        subtitle={`${run.source.name} · ${run.status}`}
      />

      <div className={styles.links}>
        <ButtonLink href="/admin/ingest" size="sm">
          All runs
        </ButtonLink>
        <ButtonLink href={`/admin/sources/${run.source.id}`} size="sm">
          Source
        </ButtonLink>
      </div>

      {qp.approved ? (
        <div className={styles.notice}>Approved.</div>
      ) : qp.rejected ? (
        <div className={styles.notice}>Rejected.</div>
      ) : null}

      <div className={styles.meta}>
        Started {formatDate(run.startedAt)}
        {run.finishedAt ? ` · Finished ${formatDate(run.finishedAt)}` : ''}
        · {run.items.length} items (showing up to 200)
      </div>

      {run.items.length === 0 ? (
        <div className={styles.notice}>No items yet.</div>
      ) : (
        <ol className={styles.itemList}>
          {run.items.map((item) => {
            const title = getProposedTitle(item.proposedChange) ?? 'Untitled';
            const docUrl = item.sourceDocument.canonicalUrl ?? item.sourceDocument.url;
            const appliedEntryId = getAppliedEntryId(item.diff);
            const matchedEntryId = getMatchedEntryId(item.stageOutputs);
            const extractedText = getExtractedText(item.stageOutputs);

            return (
              <li key={item.id} className={styles.itemCard}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemMeta}>
                    {item.stage} · {item.licenseGate}
                    {item.confidenceScore != null ? ` · score ${item.confidenceScore}` : ''}
                  </span>
                  <span className={styles.itemTitle}>{title}</span>
                  <a
                    className={styles.inlineLink}
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source doc
                  </a>
                  {matchedEntryId ? (
                    <Link className={styles.inlineLink} href={`/admin/entries/${matchedEntryId}`}>
                      Matched entry
                    </Link>
                  ) : null}
                  {appliedEntryId ? (
                    <Link className={styles.inlineLink} href={`/admin/entries/${appliedEntryId}`}>
                      Entry
                    </Link>
                  ) : null}
                </div>

                {item.error ? (
                  <div className={styles.itemError}>
                    <span className={styles.label}>Error:</span> {item.error}
                  </div>
                ) : null}

                {item.licenseGateReason ? (
                  <div className={styles.itemError}>
                    <span className={styles.label}>License:</span> {item.licenseGateReason}
                  </div>
                ) : null}

                <div className={styles.actions}>
                  <form action={approve}>
                    <input type="hidden" name="ingestItemId" value={item.id} />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={item.stage === 'APPLIED' || item.stage === 'REJECTED'}
                    >
                      Approve
                    </Button>
                  </form>

                  <form action={reject} className={styles.rejectForm}>
                    <input type="hidden" name="runId" value={run.id} />
                    <input type="hidden" name="ingestItemId" value={item.id} />
                    <input className={styles.input} name="reason" placeholder="Reject reason" />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={item.stage === 'APPLIED' || item.stage === 'REJECTED'}
                    >
                      Reject
                    </Button>
                  </form>
                </div>

                <details className={styles.details}>
                  <summary className={styles.summary}>Proposed change JSON</summary>
                  <pre className={styles.pre}>
                    {JSON.stringify(item.proposedChange, null, 2)}
                  </pre>
                </details>

                {extractedText ? (
                  <details className={styles.details}>
                    <summary className={styles.summary}>Extracted text</summary>
                    <pre className={styles.pre}>
                      {extractedText}
                    </pre>
                  </details>
                ) : null}

                <details className={styles.details}>
                  <summary className={styles.summary}>Stage outputs JSON</summary>
                  <pre className={styles.pre}>
                    {JSON.stringify(item.stageOutputs, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

async function approve(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const ingestItemId = String(formData.get('ingestItemId') ?? '');
  const { entryId } = await approveIngestItem({ actorUserId: actor.dbUserId, ingestItemId });

  redirect(`/admin/entries/${entryId}`);
}

async function reject(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const runId = String(formData.get('runId') ?? '');
  const ingestItemId = String(formData.get('ingestItemId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  await rejectIngestItem({ actorUserId: actor.dbUserId, ingestItemId, reason });
  redirect(`/admin/ingest/runs/${runId}?rejected=1`);
}
