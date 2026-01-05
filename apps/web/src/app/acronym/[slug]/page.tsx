import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  getPrismaClient,
  listPublishedRelationshipsForEntry,
  resolvePublishedEntryBySlug,
} from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Markdown } from '@/components/Markdown';
import { ViewTracker } from '@/components/ViewTracker';
import styles from '@/app/_styles/Entry.module.css';

export const dynamic = 'force-dynamic';

type AcronymEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: AcronymEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'ACRONYM', slug });

  if (!resolved) {
    return { title: 'Not found' };
  }

  return {
    title: resolved.entry.displayTitle,
    description:
      resolved.entry.summaryText ??
      `SynAc entry for the cybersecurity acronym “${resolved.entry.displayTitle}”.`,
    alternates: { canonical: `/acronym/${resolved.canonicalSlug}` },
  };
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function AcronymEntryPage({ params }: AcronymEntryPageProps) {
  const { slug } = await params;

  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'ACRONYM', slug });

  if (!resolved) notFound();

  if (resolved.needsRedirect) {
    permanentRedirect(`/acronym/${resolved.canonicalSlug}`);
  }

  const entry = await prisma.entry.findFirst({
    where: { id: resolved.entry.id, status: 'PUBLISHED', deletedAt: null },
    include: {
      variants: { orderBy: [{ variantType: 'asc' }, { variantText: 'asc' }] },
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

  const relationships = await listPublishedRelationshipsForEntry(prisma, {
    entryId: entry.id,
    limit: 50,
  });

  const related = relationships
    .filter((r) => r.relationshipType === 'RELATED')
    .slice(0, 10);
  const seeAlso = relationships
    .filter((r) => r.relationshipType === 'SEE_ALSO')
    .slice(0, 10);

  const citationsBySenseId = new Map<string, Map<string, typeof provenance[number]['citation']>>();
  for (const fp of provenance) {
    if (fp.entityType !== 'SENSE') continue;

    const map = citationsBySenseId.get(fp.entityId) ?? new Map();
    map.set(fp.citationId, fp.citation);
    citationsBySenseId.set(fp.entityId, map);
  }

  const variants = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of entry.variants) {
      const text = v.variantText.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  })();

  const expandedForms = (() => {
    const raw = [
      ...entry.senses.map((s) => s.expandedForm).filter((v): v is string => Boolean(v?.trim())),
      ...variants.filter((v) => v.includes(' ')),
    ];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of raw) {
      const text = v.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  })();

  const alsoKnownAs = variants.filter((v) => !expandedForms.some((e) => e.toLowerCase() === v.toLowerCase()));

  return (
    <>
      <ViewTracker entryId={entry.id} />
      <PageHeader
        badge="Acronym"
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

      {expandedForms.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Stands for</h2>
          <div className={styles.variants}>
            {expandedForms.map((v) => (
              <span key={v} className={`${styles.variantPill} ${styles.variantPillStrong}`}>
                {v}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {alsoKnownAs.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Also known as</h2>
          {alsoKnownAs.length <= 8 ? (
            <div className={styles.variants}>
              {alsoKnownAs.map((v) => (
                <span key={v} className={styles.variantPill}>
                  {v}
                </span>
              ))}
            </div>
          ) : (
            <details className={styles.variantDetails}>
              <summary className={styles.variantSummary}>Show {alsoKnownAs.length} variants</summary>
              <div className={styles.variants} style={{ marginTop: 10 }}>
                {alsoKnownAs.map((v) => (
                  <span key={v} className={styles.variantPill}>
                    {v}
                  </span>
                ))}
              </div>
            </details>
          )}
        </section>
      ) : null}

      {entry.summaryMd ? <Markdown>{entry.summaryMd}</Markdown> : null}

      {entry.senses.length > 1 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Meanings</h2>
          <nav className={styles.meanings} aria-label="Meanings">
            {entry.senses.map((sense) => (
              <a
                key={sense.id}
                href={`#sense-${sense.id}`}
                className={styles.meaningLink}
              >
                {sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`}
              </a>
            ))}
          </nav>
        </section>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Senses</h2>
        {entry.senses.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>No published senses yet.</div>
        ) : (
          <div>
            {entry.senses.map((sense) => {
              const citations = Array.from(citationsBySenseId.get(sense.id)?.values() ?? []);
              return (
                <div key={sense.id} id={`sense-${sense.id}`} className={styles.senseCard}>
                  <div className={styles.senseHeader}>
                    <div className={styles.senseLabel}>
                      {sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`}
                    </div>
                    {sense.expandedForm ? (
                      <div className={styles.senseSub}>{sense.expandedForm}</div>
                    ) : null}
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
                            {c.sourceDocument.title ? (
                              <div className={styles.refDocTitle}>{c.sourceDocument.title}</div>
                            ) : null}
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.refUrl}
                            >
                              {c.url}
                            </a>
                            {c.licenseNote || c.attributionText ? (
                              <div className={styles.refNote}>
                                {c.licenseNote ? <div>{c.licenseNote}</div> : null}
                                {c.attributionText ? (
                                  <div>{c.attributionText}</div>
                                ) : null}
                              </div>
                            ) : null}
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

      {related.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Related</h2>
          <ul className={styles.relList}>
            {related.map((r) => (
              <li key={r.otherEntry.id}>
                <Link
                  href={
                    r.otherEntry.entryType === 'TERM'
                      ? `/term/${r.otherEntry.primarySlug}`
                      : `/acronym/${r.otherEntry.primarySlug}`
                  }
                  className={styles.relLink}
                >
                  {r.otherEntry.displayTitle}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {seeAlso.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>See also</h2>
          <ul className={styles.relList}>
            {seeAlso.map((r) => (
              <li key={r.otherEntry.id}>
                <Link
                  href={
                    r.otherEntry.entryType === 'TERM'
                      ? `/term/${r.otherEntry.primarySlug}`
                      : `/acronym/${r.otherEntry.primarySlug}`
                  }
                  className={styles.relLink}
                >
                  {r.otherEntry.displayTitle}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
