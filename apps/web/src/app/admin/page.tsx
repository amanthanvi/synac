import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/Panel';

import proseStyles from '../_styles/Prose.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const NEEDS_LABEL_LIMIT = 25;

/**
 * Published entries carrying at least one sense the ingest pipeline could not
 * name. These are live on the public site right now, showing an unlabelled
 * meaning, so they are the highest-value editorial queue on the dashboard.
 */
async function loadNeedsLabelQueue() {
  const prisma = getPrismaClient();

  const [entries, total] = await Promise.all([
    prisma.entry.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        senses: {
          some: { needsLabel: true, deletedAt: null, status: 'PUBLISHED' },
        },
      },
      select: {
        id: true,
        displayTitle: true,
        entryType: true,
        primarySlug: true,
        updatedAt: true,
        senses: {
          where: { needsLabel: true, deletedAt: null, status: 'PUBLISHED' },
          select: { id: true, senseOrder: true, definitionText: true },
          orderBy: [{ senseOrder: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: NEEDS_LABEL_LIMIT,
    }),
    prisma.entry.count({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        senses: {
          some: { needsLabel: true, deletedAt: null, status: 'PUBLISHED' },
        },
      },
    }),
  ]);

  return { entries, total };
}

export default async function AdminDashboardPage() {
  const { entries, total } = await loadNeedsLabelQueue();

  return (
    <>
      <PageHeader
        badge="Admin"
        title="Dashboard"
        subtitle="Internal editorial + ingest controls. Access is allowlist-gated."
      />

      <Panel>
        <div className={proseStyles.prose}>
          <h2>Needs label ({total})</h2>
          {entries.length === 0 ? (
            <p>
              No published entry has an unnamed sense. New ones appear here
              whenever ingest opens a meaning it could not attach to an existing
              sense.
            </p>
          ) : (
            <>
              <p>
                These entries are published with at least one sense an editor
                has not yet named. Readers see them today, so they are the first
                thing to fix.
              </p>
              <ul className={styles.queueList}>
                {entries.map((entry) => (
                  <li key={entry.id} className={styles.queueItem}>
                    <Link href={`/admin/entries/${entry.id}`}>
                      {entry.displayTitle}
                    </Link>{' '}
                    <span className={styles.queueMeta}>
                      {entry.entryType} · {entry.senses.length} unnamed{' '}
                      {entry.senses.length === 1 ? 'sense' : 'senses'}
                    </span>
                    {entry.senses[0]?.definitionText ? (
                      <div className={styles.queueSnippet}>
                        {entry.senses[0].definitionText.slice(0, 160)}
                        {entry.senses[0].definitionText.length > 160 ? '…' : ''}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {total > entries.length ? (
                <p className={styles.queueMeta}>
                  Showing the {entries.length} most recently updated of {total}.
                </p>
              ) : null}
            </>
          )}
        </div>
      </Panel>

      <Panel>
        <div className={proseStyles.prose}>
          <p>
            Use Entries to draft/publish, Sources + Ingest to populate the
            corpus, Tags to curate navigation, Takedown for removals, and Audit
            for history/rollback.
          </p>
          <p>
            Search integrity can be inspected from{' '}
            <Link href="/admin/search-index">Search index</Link>.
          </p>
        </div>
      </Panel>
    </>
  );
}
