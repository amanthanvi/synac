import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { getPrismaClient, resolvePublishedEntryBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Markdown } from '@/components/Markdown';
import styles from '@/app/_styles/Entry.module.css';

export const dynamic = 'force-dynamic';

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;

  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'TERM', slug });

  if (!resolved) notFound();

  if (resolved.needsRedirect) {
    permanentRedirect(`/term/${resolved.canonicalSlug}`);
  }

  const entry = await prisma.entry.findFirst({
    where: { id: resolved.entry.id, status: 'PUBLISHED', deletedAt: null },
    include: {
      senses: {
        where: { status: 'PUBLISHED', deletedAt: null },
        orderBy: [{ senseOrder: 'asc' }],
        include: { examples: { orderBy: [{ exampleOrder: 'asc' }] } },
      },
      entryTags: {
        where: { tag: { deletedAt: null } },
        include: { tag: true },
      },
    },
  });

  if (!entry) notFound();

  const senseIds = entry.senses.map((s) => s.id);
  const provenance = senseIds.length
    ? await prisma.fieldProvenance.findMany({
        where: { entityType: 'SENSE', entityId: { in: senseIds } },
        include: { citation: { include: { source: true, sourceDocument: true } } },
        orderBy: [{ extractedAt: 'desc' }],
      })
    : [];

  const citationsBySenseId = new Map<string, Map<string, typeof provenance[number]['citation']>>();
  for (const fp of provenance) {
    if (fp.entityType !== 'SENSE') continue;

    const map = citationsBySenseId.get(fp.entityId) ?? new Map();
    map.set(fp.citationId, fp.citation);
    citationsBySenseId.set(fp.entityId, map);
  }

  return (
    <>
      <PageHeader
        badge="Term"
        title={entry.displayTitle}
        subtitle={entry.summaryText ?? 'No summary yet.'}
      />

      <div className={styles.metaRow}>
        <span className={styles.pill}>Updated {formatDate(entry.updatedAt)}</span>
        {entry.entryTags.length ? (
          <div className={styles.tags}>
            {entry.entryTags.map(({ tag }) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className={styles.tagLink}>
                {tag.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {entry.summaryMd ? <Markdown>{entry.summaryMd}</Markdown> : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Senses</h2>
        {entry.senses.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>No published senses yet.</div>
        ) : (
          <div>
            {entry.senses.map((sense) => {
              const citations = Array.from(citationsBySenseId.get(sense.id)?.values() ?? []);
              return (
                <div key={sense.id} className={styles.senseCard}>
                  <div className={styles.senseHeader}>
                    <div className={styles.senseLabel}>
                      {sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    {sense.definitionMd ? (
                      <Markdown>{sense.definitionMd}</Markdown>
                    ) : sense.definitionText ? (
                      <p style={{ lineHeight: 1.8, opacity: 0.85 }}>{sense.definitionText}</p>
                    ) : (
                      <p style={{ lineHeight: 1.8, opacity: 0.75 }}>No definition yet.</p>
                    )}
                  </div>

                  {sense.examples.length ? (
                    <div style={{ marginTop: 12 }}>
                      <div className={styles.refsTitle}>Examples</div>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.8, opacity: 0.85 }}>
                        {sense.examples.map((ex) => (
                          <li key={ex.id}>
                            {ex.exampleMd ? <Markdown>{ex.exampleMd}</Markdown> : ex.exampleText}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className={styles.refs}>
                    <div className={styles.refsTitle}>References</div>
                    {citations.length === 0 ? (
                      <div style={{ opacity: 0.75 }}>No references recorded for this sense yet.</div>
                    ) : (
                      <ul className={styles.refsList}>
                        {citations.map((c) => (
                          <li key={c.id} className={styles.refItem}>
                            <div className={styles.refLine1}>
                              <span className={styles.refSource}>{c.source.name}</span>
                              <span className={styles.refDate}>{formatDate(c.accessedAt)}</span>
                            </div>
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.refUrl}
                            >
                              {c.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
