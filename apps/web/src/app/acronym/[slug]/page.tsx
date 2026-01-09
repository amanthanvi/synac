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
import { EntrySenseHashSync } from '@/components/EntrySenseHashSync';
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

function normalizeRefUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreByDefinition(expansion: string, definition: string): number {
  const tokens = expansion
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);

  if (!tokens.length) return 0;

  const haystack = definition.toLowerCase();
  let score = 0;
  for (const token of new Set(tokens)) {
    if (new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(haystack)) {
      score += 1;
    }
  }

  return score;
}

export default async function AcronymEntryPage({ params }: AcronymEntryPageProps) {
  const { slug } = await params;

  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'ACRONYM', slug });

  if (!resolved) {
    const fallback = await resolvePublishedEntryBySlug(prisma, { entryType: 'TERM', slug });
    if (fallback) {
      permanentRedirect(`/term/${fallback.canonicalSlug}`);
    }
    notFound();
  }

  if (resolved.entry.entryType === 'TERM') {
    permanentRedirect(`/term/${resolved.canonicalSlug}`);
  }

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

  const standsForPrimary = (() => {
    if (expandedForms.length === 0) {
      return { primary: null as null | string, alternates: [] as string[] };
    }

    if (expandedForms.length === 1) {
      return { primary: expandedForms[0]!, alternates: [] as string[] };
    }

    const definition = (entry.summaryText ?? entry.summaryMd ?? '').trim();
    if (!definition) {
      return { primary: expandedForms[0]!, alternates: expandedForms.slice(1) };
    }

    const scored = expandedForms
      .map((v) => ({ text: v, score: scoreByDefinition(v, definition) }))
      .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));

    const primary = scored[0]!.text;
    const alternates = expandedForms.filter((v) => v.toLowerCase() !== primary.toLowerCase());

    return { primary, alternates };
  })();

  const alsoKnownAs = variants.filter((v) => !expandedForms.some((e) => e.toLowerCase() === v.toLowerCase()));

  return (
    <>
      <ViewTracker entryId={entry.id} />
      <PageHeader
        badge="Acronym"
        title={entry.displayTitle}
        subtitle={entry.summaryMd ? undefined : (entry.summaryText ?? 'No summary yet.')}
      />

      <div className={styles.entryGrid}>
        <aside className={styles.aside} aria-label="At a glance">
          <div className={styles.asideBlock}>
            <div className={styles.asideTitle}>At a glance</div>
            <div className={styles.asideMetaRow}>
              <span className={styles.pill}>Updated {formatDate(entry.updatedAt)}</span>
            </div>
            {entry.entryTags.length ? (
              <div className={`${styles.tags} ${styles.asideTags}`}>
                {entry.entryTags.map(({ tag }) => (
                  <Link key={tag.id} href={`/tags/${tag.slug}`} className={styles.tagLink}>
                    {tag.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {standsForPrimary.primary ? (
            <div className={styles.asideBlock}>
              <div className={styles.asideTitle}>Stands for</div>
              <div className={styles.variants}>
                <span
                  key={standsForPrimary.primary}
                  className={`${styles.variantPill} ${styles.variantPillStrong}`}
                >
                  {standsForPrimary.primary}
                </span>
              </div>
              {standsForPrimary.alternates.length ? (
                <details className={styles.variantDetails}>
                  <summary className={styles.variantSummary}>
                    Show {standsForPrimary.alternates.length}{' '}
                    {standsForPrimary.alternates.length === 1
                      ? 'alternate expansion'
                      : 'alternate expansions'}
                  </summary>
                  <div className={styles.variantBody}>
                    <div className={styles.variants}>
                      {standsForPrimary.alternates.map((v) => (
                        <span key={v} className={styles.variantPill}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          {alsoKnownAs.length ? (
            <div className={styles.asideBlock}>
              <div className={styles.asideTitle}>Also known as</div>
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
                  <summary className={styles.variantSummary}>
                    Show {alsoKnownAs.length} variants
                  </summary>
                  <div className={styles.variantBody}>
                    <div className={styles.variants}>
                      {alsoKnownAs.map((v) => (
                        <span key={v} className={styles.variantPill}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          ) : null}

          {entry.senses.length > 1 ? (
            <div className={styles.asideBlock}>
              <div className={styles.asideTitle}>On this page</div>
              <ul className={styles.toc}>
                {entry.senses.map((sense) => (
                  <li key={sense.id}>
                    <a href={`#sense-${sense.id}`} className={styles.tocLink}>
                      {sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {related.length ? (
            <div className={styles.asideBlock}>
              <div className={styles.asideTitle}>Related</div>
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
            </div>
          ) : null}

          {seeAlso.length ? (
            <div className={styles.asideBlock}>
              <div className={styles.asideTitle}>See also</div>
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
            </div>
          ) : null}
        </aside>

        <div className={styles.main}>
          {entry.summaryMd ? <Markdown>{entry.summaryMd}</Markdown> : null}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Senses</h2>
            {entry.senses.length === 0 ? (
              <div className={styles.emptyText}>No published senses yet.</div>
            ) : (
              <div data-senses>
                <EntrySenseHashSync collapseOthers={entry.senses.length >= 10} />
                {entry.senses.map((sense, idx) => {
                  const citations = (() => {
                    const raw = Array.from(citationsBySenseId.get(sense.id)?.values() ?? []);
                    const seen = new Set<string>();
                    const out: typeof raw = [];
                    for (const c of raw) {
                      const key = `${c.sourceId}:${normalizeRefUrl(c.url)}`;
                      if (seen.has(key)) continue;
                      seen.add(key);
                      out.push(c);
                    }
                    return out;
                  })();
                  const openByDefault = entry.senses.length < 10 || idx === 0;
                  return (
                    <details
                      key={sense.id}
                      id={`sense-${sense.id}`}
                      className={styles.senseCard}
                      open={openByDefault}
                      data-sense
                    >
                      <summary className={`${styles.senseHeader} ${styles.senseSummary}`}>
                        <span className={styles.senseLabel}>
                          {sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`}
                        </span>
                        {sense.expandedForm ? (
                          <span className={styles.senseSub}>{sense.expandedForm}</span>
                        ) : null}
                        <span className={styles.senseChevron} aria-hidden="true">
                          ▾
                        </span>
                      </summary>

                      <div className={styles.senseBody}>
                        {sense.definitionMd ? (
                          <Markdown>{sense.definitionMd}</Markdown>
                        ) : sense.definitionText ? (
                          <p className={styles.senseText}>{sense.definitionText}</p>
                        ) : (
                          <p className={styles.senseTextMuted}>No definition yet.</p>
                        )}
                      </div>

                      {sense.examples.length ? (
                        <div className={styles.examples}>
                          <div className={styles.refsTitle}>Examples</div>
                          <ul className={styles.examplesList}>
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
                          <div className={styles.senseTextMuted}>
                            No references recorded for this sense yet.
                          </div>
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
                                    {c.attributionText ? <div>{c.attributionText}</div> : null}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
