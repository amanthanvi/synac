import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPrismaClient, type Prisma } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { requireActionRole } from '@/lib/admin';
import { approveIngestItem, rejectIngestItem } from '@/lib/adminIngest';
import { formatDateTime } from '@/app/admin/_format';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type AdminIngestRunPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ approved?: string; rejected?: string }>;
};

type IngestItemJson = {
  proposedChange: Prisma.JsonValue;
  stageOutputs: Prisma.JsonValue;
  diff: Prisma.JsonValue;
};

type IngestItemDetails = {
  title: string;
  appliedEntryId: string | null;
  matchedEntryId: string | null;
  extractedText: string | null;
};

function jsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function jsonString(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function firstNonEmpty(
  ...values: Array<Prisma.JsonValue | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * The three JSON columns on an ingest item are shaped by the worker pipeline
 * and are untyped at the database boundary. Narrow them once, here, so the
 * markup below only ever sees strings.
 */
function readIngestItemDetails(item: IngestItemJson): IngestItemDetails {
  const stages = jsonObject(item.stageOutputs);
  const extracted = jsonObject(stages.extracted);

  return {
    title:
      jsonString(jsonObject(item.proposedChange).displayTitle) ?? 'Untitled',
    appliedEntryId: jsonString(jsonObject(item.diff).appliedEntryId),
    matchedEntryId: jsonString(jsonObject(stages.deduped).matchedEntryId),
    extractedText: firstNonEmpty(
      extracted.definitionMd,
      extracted.overviewMd,
      extracted.descriptionMd,
    ),
  };
}

export default async function AdminIngestRunPage({
  params,
  searchParams,
}: AdminIngestRunPageProps) {
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
        Started {formatDateTime(run.startedAt)}
        {run.finishedAt
          ? ` · Finished ${formatDateTime(run.finishedAt)}`
          : ''}· {run.items.length} items (showing up to 200)
      </div>

      {run.items.length === 0 ? (
        <div className={styles.notice}>No items yet.</div>
      ) : (
        <ol className={styles.itemList}>
          {run.items.map((item) => {
            const { title, appliedEntryId, matchedEntryId, extractedText } =
              readIngestItemDetails(item);
            const docUrl =
              item.sourceDocument.canonicalUrl ?? item.sourceDocument.url;

            return (
              <li key={item.id} className={styles.itemCard}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemMeta}>
                    {item.stage} · {item.licenseGate}
                    {item.confidenceScore != null
                      ? ` · score ${item.confidenceScore}`
                      : ''}
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
                    <Link
                      className={styles.inlineLink}
                      href={`/admin/entries/${matchedEntryId}`}
                    >
                      Matched entry
                    </Link>
                  ) : null}
                  {appliedEntryId ? (
                    <Link
                      className={styles.inlineLink}
                      href={`/admin/entries/${appliedEntryId}`}
                    >
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
                    <span className={styles.label}>License:</span>{' '}
                    {item.licenseGateReason}
                  </div>
                ) : null}

                <div className={styles.actions}>
                  <form action={approve}>
                    <input type="hidden" name="ingestItemId" value={item.id} />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={
                        item.stage === 'APPLIED' || item.stage === 'REJECTED'
                      }
                    >
                      Approve
                    </Button>
                  </form>

                  <form action={reject} className={styles.rejectForm}>
                    <input type="hidden" name="runId" value={run.id} />
                    <input type="hidden" name="ingestItemId" value={item.id} />
                    <input
                      className={styles.input}
                      name="reason"
                      placeholder="Reject reason"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        item.stage === 'APPLIED' || item.stage === 'REJECTED'
                      }
                    >
                      Reject
                    </Button>
                  </form>
                </div>

                <details className={styles.details}>
                  <summary className={styles.summary}>
                    Proposed change JSON
                  </summary>
                  <pre className={styles.pre}>
                    {JSON.stringify(item.proposedChange, null, 2)}
                  </pre>
                </details>

                {extractedText ? (
                  <details className={styles.details}>
                    <summary className={styles.summary}>Extracted text</summary>
                    <pre className={styles.pre}>{extractedText}</pre>
                  </details>
                ) : null}

                <details className={styles.details}>
                  <summary className={styles.summary}>
                    Stage outputs JSON
                  </summary>
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

  const actor = await requireActionRole('ADMIN', 'EDITOR');

  const ingestItemId = String(formData.get('ingestItemId') ?? '');
  const { entryId } = await approveIngestItem({
    actorUserId: actor.dbUserId,
    ingestItemId,
  });

  redirect(`/admin/entries/${entryId}`);
}

async function reject(formData: FormData) {
  'use server';

  const actor = await requireActionRole('ADMIN', 'EDITOR');

  const runId = String(formData.get('runId') ?? '');
  const ingestItemId = String(formData.get('ingestItemId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  await rejectIngestItem({ actorUserId: actor.dbUserId, ingestItemId, reason });
  redirect(`/admin/ingest/runs/${runId}?rejected=1`);
}
