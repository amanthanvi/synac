import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  getPrismaClient,
  listPublishedRelationshipsForEntry,
  resolvePublishedEntryBySlug,
} from '@synac/db';

import { CitationPill } from '@/components/CitationPill';
import { EntryPreviewLink } from '@/components/EntryPreviewLink';
import { Markdown } from '@/components/Markdown';
import { EntrySenseHashSync } from '@/components/EntrySenseHashSync';
import { StickySenseToc } from '@/components/StickySenseToc';
import { ViewTracker } from '@/components/ViewTracker';
import { KeyValueList } from '@/components/ui/KeyValue';
import styles from '@/app/_styles/Entry.module.css';
import { markdownToText } from '@/lib/text';

export const dynamic = 'force-dynamic';

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TermEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'TERM', slug });

  if (!resolved) {
    return { title: 'Not found' };
  }

  return {
    title: resolved.entry.displayTitle,
    description:
      resolved.entry.summaryText ??
      `SynAc entry for the cybersecurity term “${resolved.entry.displayTitle}”.`,
    alternates: { canonical: `/term/${resolved.canonicalSlug}` },
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

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;

  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'TERM', slug });

  if (!resolved) {
    const fallback = await resolvePublishedEntryBySlug(prisma, { entryType: 'ACRONYM', slug });
    if (fallback) {
      permanentRedirect(`/acronym/${fallback.canonicalSlug}`);
    }
    notFound();
  }

  if (resolved.entry.entryType === 'ACRONYM') {
    permanentRedirect(`/acronym/${resolved.canonicalSlug}`);
  }

  if (resolved.needsRedirect) {
    permanentRedirect(`/term/${resolved.canonicalSlug}`);
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

  const provenanceBySenseId = new Map<string, Array<(typeof provenance)[number]>>();
  for (const fp of provenance) {
    if (fp.entityType !== 'SENSE') continue;
    const list = provenanceBySenseId.get(fp.entityId) ?? [];
    list.push(fp);
    provenanceBySenseId.set(fp.entityId, list);
  }

  const variants = (() => {
    const seen = new Set<string>();
    const out: Array<{ text: string; type: string }> = [];
    for (const v of entry.variants) {
      const text = v.variantText.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, type: v.variantType });
    }
    return out;
  })();

  const titleIsShortform = (() => {
    const v = entry.displayTitle.trim();
    if (!v || v.includes(' ')) return false;
    if (v.length < 2 || v.length > 12) return false;
    const letters = v.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2) return false;
    const uppercase = letters.replace(/[^A-Z]/g, '').length;
    return uppercase >= 2;
  })();

  const standsFor = variants.filter((v) => v.text.includes(' '));
  const alsoKnownAs = titleIsShortform && standsFor.length ? variants.filter((v) => !v.text.includes(' ')) : variants;

  const standsForPrimary = (() => {
    if (!titleIsShortform || standsFor.length === 0) {
      return { primary: null as null | string, alternates: [] as string[] };
    }

    const definition = (entry.summaryText ?? entry.summaryMd ?? '').trim();
    if (!definition) {
      return { primary: standsFor[0]!.text, alternates: standsFor.slice(1).map((v) => v.text) };
    }

    const scored = standsFor
      .map((v) => ({ text: v.text, score: scoreByDefinition(v.text, definition) }))
      .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));

    const primary = scored[0]!.text;
    const alternates = standsFor
      .map((v) => v.text)
      .filter((v) => v.toLowerCase() !== primary.toLowerCase());

    return { primary, alternates };
  })();

  const tocItems = entry.senses.map((sense) => ({
    id: sense.id,
    label: sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`,
  }));

  const relatedEntryIds = Array.from(
    new Set([...related, ...seeAlso].map((r) => r.otherEntry.id))
  );

  const relatedSummaries = relatedEntryIds.length
    ? await prisma.entry.findMany({
        where: { id: { in: relatedEntryIds }, status: 'PUBLISHED', deletedAt: null },
        select: { id: true, summaryText: true, summaryMd: true },
      })
    : [];

  const otherSummaryById = new Map<string, string | null>();
  for (const other of relatedSummaries) {
    const summary =
      other.summaryText ?? (other.summaryMd ? markdownToText(other.summaryMd) : null);
    otherSummaryById.set(other.id, summary);
  }

  return (
    <>
      <ViewTracker entryId={entry.id} />
      <div className={styles.layout}>
        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.badgeRow}>
              <span className={`${styles.typeBadge} ${styles.typeBadgeTerm}`}>TERM</span>
            </div>
            <h1 className={styles.title}>{entry.displayTitle}</h1>
            {entry.summaryMd ? (
              <div className={styles.summary}>
                <Markdown>{entry.summaryMd}</Markdown>
              </div>
            ) : (
              <p className={styles.summary}>{entry.summaryText ?? 'No summary yet.'}</p>
            )}

            <div className={styles.meta}>
              <KeyValueList
                items={[
                  {
                    label: 'Updated',
                    value: (
                      <time className={styles.updated} dateTime={entry.updatedAt.toISOString()}>
                        {formatDate(entry.updatedAt)}
                      </time>
                    ),
                  },
                  ...(standsForPrimary.primary
                    ? [
                        {
                          label: 'Stands for',
                          value: (
                            <div className={styles.variants}>
                              <span className={`${styles.variant} ${styles.variantStrong}`}>
                                {standsForPrimary.primary}
                              </span>
                              {standsForPrimary.alternates.map((v) => (
                                <span key={v} className={styles.variant}>
                                  {v}
                                </span>
                              ))}
                            </div>
                          ),
                        },
                      ]
                    : []),
                  ...(alsoKnownAs.length
                    ? [
                        {
                          label: 'Also known as',
                          value: (
                            <div className={styles.variants}>
                              {alsoKnownAs.map((v) => (
                                <span key={v.text} className={styles.variant}>
                                  {v.text}
                                </span>
                              ))}
                            </div>
                          ),
                        },
                      ]
                    : []),
                  ...(entry.entryTags.length
                    ? [
                        {
                          label: 'Tags',
                          value: (
                            <div className={styles.tags}>
                              {entry.entryTags.map(({ tag }) => (
                                <Link key={tag.id} href={`/tags/${tag.slug}`} className={styles.tag}>
                                  {tag.name}
                                </Link>
                              ))}
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </header>

          <section className={styles.section} aria-label="Senses">
            <h2 className={styles.sectionTitle}>Senses</h2>
            {entry.senses.length === 0 ? (
              <p className={styles.senseMuted}>No published senses yet.</p>
            ) : (
              <div data-senses>
                <EntrySenseHashSync collapseOthers={entry.senses.length >= 10} />
                <div className={styles.senseList}>
                  {entry.senses.map((sense, idx) => {
                    const provenanceItems = provenanceBySenseId.get(sense.id) ?? [];
                    const citations = (() => {
                      const rank = (mode: (typeof provenanceItems)[number]['contentMode']) => {
                        if (mode === 'QUOTED') return 3;
                        if (mode === 'PARAPHRASED') return 2;
                        return 1;
                      };

                      const map = new Map<
                        string,
                        {
                          citation: (typeof provenanceItems)[number]['citation'];
                          contentMode: (typeof provenanceItems)[number]['contentMode'];
                        }
                      >();

                      for (const fp of provenanceItems) {
                        const c = fp.citation;
                        const key = `${c.sourceId}:${normalizeRefUrl(c.url)}`;
                        const existing = map.get(key);
                        if (!existing) {
                          map.set(key, { citation: c, contentMode: fp.contentMode });
                          continue;
                        }

                        if (rank(fp.contentMode) > rank(existing.contentMode)) {
                          existing.contentMode = fp.contentMode;
                        }
                      }

                      return Array.from(map.values());
                    })();

                    const excerpt = (() => {
                      const raw = sense.definitionText
                        ? sense.definitionText
                        : sense.definitionMd
                          ? markdownToText(sense.definitionMd)
                          : '';
                      const cleaned = raw.replace(/\s+/g, ' ').trim();
                      return cleaned || 'No definition yet.';
                    })();

                    const openByDefault = entry.senses.length === 1 || idx === 0;

                    return (
                      <details
                        key={sense.id}
                        id={`sense-${sense.id}`}
                        className={styles.senseCard}
                        open={openByDefault}
                        data-sense
                      >
                        <summary className={styles.senseSummary}>
                          <div className={styles.senseSummaryTop}>
                            <span className={styles.senseLabel}>
                              {sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`}
                            </span>
                            <span className={styles.senseChevron} aria-hidden="true">
                              ▾
                            </span>
                          </div>
                          <div className={styles.senseExcerpt}>{excerpt}</div>
                        </summary>

                        <div className={styles.senseContent}>
                          <div className={styles.senseContentInner}>
                            <div className={styles.senseBody}>
                              {sense.definitionMd ? (
                                <Markdown>{sense.definitionMd}</Markdown>
                              ) : sense.definitionText ? (
                                <p>{sense.definitionText}</p>
                              ) : (
                                <p className={styles.senseMuted}>No definition yet.</p>
                              )}
                            </div>

                            {citations.length ? (
                              <div className={styles.inlineSources} aria-label="Sources">
                                {citations.map(({ citation, contentMode }) => (
                                  <CitationPill
                                    key={citation.id}
                                    sourceName={citation.source.name}
                                    url={citation.url}
                                    accessedAtLabel={formatDate(citation.accessedAt)}
                                    documentTitle={citation.sourceDocument.title}
                                    licenseNote={citation.licenseNote}
                                    attributionText={citation.attributionText}
                                    contentMode={contentMode}
                                  />
                                ))}
                              </div>
                            ) : null}

                            {sense.examples.length ? (
                              <div className={styles.examples}>
                                <div className={styles.sectionTitle}>Examples</div>
                                <ul className={styles.examplesList}>
                                  {sense.examples.map((ex) => (
                                    <li key={ex.id} className={styles.exampleItem}>
                                      {ex.exampleMd ? (
                                        <Markdown>{ex.exampleMd}</Markdown>
                                      ) : ex.exampleText ? (
                                        <p>{ex.exampleText}</p>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            <div className={styles.bib} aria-label="Bibliography">
                              <div className={styles.sectionTitle}>Bibliography</div>
                              {citations.length === 0 ? (
                                <div className={styles.senseMuted}>
                                  No references recorded for this sense yet.
                                </div>
                              ) : (
                                <ol className={styles.bibList}>
                                  {citations.map(({ citation, contentMode }) => (
                                    <li key={citation.id} className={styles.bibItem}>
                                      <div className={styles.bibSource}>
                                        {citation.source.name}
                                      </div>
                                      <div className={styles.bibMeta}>
                                        <span>Accessed {formatDate(citation.accessedAt)}</span>
                                        <span>
                                          {contentMode === 'QUOTED'
                                            ? 'Quoted'
                                            : contentMode === 'PARAPHRASED'
                                              ? 'Paraphrased'
                                              : 'Summarized'}
                                        </span>
                                      </div>
                                      {citation.sourceDocument.title ? (
                                        <div className={styles.bibDocTitle}>
                                          {citation.sourceDocument.title}
                                        </div>
                                      ) : null}
                                      <a
                                        className={styles.bibUrl}
                                        href={citation.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {citation.url}
                                      </a>
                                      {citation.licenseNote || citation.attributionText ? (
                                        <div className={styles.bibNote}>
                                          {citation.licenseNote ? (
                                            <div>{citation.licenseNote}</div>
                                          ) : null}
                                          {citation.attributionText ? (
                                            <div>{citation.attributionText}</div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {related.length || seeAlso.length ? (
            <section className={styles.relations} aria-label="Related entries">
              {related.length ? (
                <div>
                  <h2 className={styles.sectionTitle}>Related</h2>
                  <ul className={styles.relationList}>
                    {related.map((r) => {
                      const href =
                        r.otherEntry.entryType === 'TERM'
                          ? `/term/${r.otherEntry.primarySlug}`
                          : `/acronym/${r.otherEntry.primarySlug}`;
                      return (
                        <li key={r.otherEntry.id}>
                          <EntryPreviewLink
                            href={href}
                            title={r.otherEntry.displayTitle}
                            entryType={r.otherEntry.entryType}
                            summary={otherSummaryById.get(r.otherEntry.id) ?? null}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {seeAlso.length ? (
                <div>
                  <h2 className={styles.sectionTitle}>See also</h2>
                  <ul className={styles.relationList}>
                    {seeAlso.map((r) => {
                      const href =
                        r.otherEntry.entryType === 'TERM'
                          ? `/term/${r.otherEntry.primarySlug}`
                          : `/acronym/${r.otherEntry.primarySlug}`;
                      return (
                        <li key={r.otherEntry.id}>
                          <EntryPreviewLink
                            href={href}
                            title={r.otherEntry.displayTitle}
                            entryType={r.otherEntry.entryType}
                            summary={otherSummaryById.get(r.otherEntry.id) ?? null}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <StickySenseToc items={tocItems} />
      </div>
    </>
  );
}
