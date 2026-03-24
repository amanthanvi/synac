import Link from 'next/link';

import { CitationPill } from '@/components/CitationPill';
import { EntryPreviewLink } from '@/components/EntryPreviewLink';
import { EntrySenseHashSync } from '@/components/EntrySenseHashSync';
import { Markdown } from '@/components/Markdown';
import { StickySenseToc } from '@/components/StickySenseToc';
import { ViewTracker } from '@/components/ViewTracker';
import { KeyValueList } from '@/components/ui/KeyValue';
import styles from '@/app/_styles/Entry.module.css';
import {
  buildSenseCitations,
  formatEntryDate,
  type PublicEntryExample,
  type PublicEntryRelation,
  type PublicEntrySense,
  type PublicEntryTagLink,
  type PublicEntryPageData,
} from '@/lib/publicEntryPage';
import { markdownToText } from '@/lib/text';

type PublicEntryPageProps = {
  entryType: 'TERM' | 'ACRONYM';
  data: PublicEntryPageData;
};

function RelationList({
  title,
  relationships,
  summaryById,
}: {
  title: string;
  relationships: PublicEntryRelation[];
  summaryById: Map<string, string | null>;
}) {
  if (relationships.length === 0) return null;

  return (
    <div>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.relationList}>
        {relationships.map((relationship) => {
          const href =
            relationship.otherEntry.entryType === 'TERM'
              ? `/term/${relationship.otherEntry.primarySlug}`
              : `/acronym/${relationship.otherEntry.primarySlug}`;
          return (
            <li key={relationship.otherEntry.id}>
              <EntryPreviewLink
                href={href}
                title={relationship.otherEntry.displayTitle}
                entryType={relationship.otherEntry.entryType}
                summary={summaryById.get(relationship.otherEntry.id) ?? null}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TagList({ entryTags }: { entryTags: PublicEntryTagLink[] }) {
  return (
    <div className={styles.tags}>
      {entryTags.map(({ tag }) => (
        <Link key={tag.id} href={`/tags/${tag.slug}`} className={styles.tag}>
          {tag.name}
        </Link>
      ))}
    </div>
  );
}

function SenseCard({
  sense,
  entryType,
  openByDefault,
  provenanceItems,
}: {
  sense: PublicEntrySense;
  entryType: 'TERM' | 'ACRONYM';
  openByDefault: boolean;
  provenanceItems: PublicEntryPageData['provenanceBySenseId'] extends Map<string, infer TValue>
    ? TValue
    : never;
}) {
  const citations = buildSenseCitations(provenanceItems);
  const excerpt = (() => {
    const raw = sense.definitionText
      ? sense.definitionText
      : sense.definitionMd
        ? markdownToText(sense.definitionMd)
        : '';
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    return cleaned || 'No definition yet.';
  })();

  return (
    <details
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
          {entryType === 'ACRONYM' && sense.expandedForm ? (
            <span className={styles.senseExpanded}>{sense.expandedForm}</span>
          ) : null}
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
                  accessedAtLabel={formatEntryDate(citation.accessedAt)}
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
                {sense.examples.map((example: PublicEntryExample) => (
                  <li key={example.id} className={styles.exampleItem}>
                    {example.exampleMd ? (
                      <Markdown>{example.exampleMd}</Markdown>
                    ) : example.exampleText ? (
                      <p>{example.exampleText}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={styles.bib} aria-label="Bibliography">
            <div className={styles.sectionTitle}>Bibliography</div>
            {citations.length === 0 ? (
              <div className={styles.senseMuted}>No references recorded for this sense yet.</div>
            ) : (
              <ol className={styles.bibList}>
                {citations.map(({ citation, contentMode }) => (
                  <li key={citation.id} className={styles.bibItem}>
                    <div className={styles.bibSource}>{citation.source.name}</div>
                    <div className={styles.bibMeta}>
                      <span>Accessed {formatEntryDate(citation.accessedAt)}</span>
                      <span>
                        {contentMode === 'QUOTED'
                          ? 'Quoted'
                          : contentMode === 'PARAPHRASED'
                            ? 'Paraphrased'
                            : 'Summarized'}
                      </span>
                    </div>
                    {citation.sourceDocument.title ? (
                      <div className={styles.bibDocTitle}>{citation.sourceDocument.title}</div>
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
                        {citation.licenseNote ? <div>{citation.licenseNote}</div> : null}
                        {citation.attributionText ? <div>{citation.attributionText}</div> : null}
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
}

export function PublicEntryPage({ entryType, data }: PublicEntryPageProps) {
  const { entry } = data;

  return (
    <>
      <ViewTracker entryId={entry.id} />
      <div className={styles.layout}>
        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.badgeRow}>
              <span
                className={`${styles.typeBadge} ${
                  entryType === 'TERM' ? styles.typeBadgeTerm : styles.typeBadgeAcronym
                }`}
              >
                {entryType}
              </span>
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
                        {formatEntryDate(entry.updatedAt)}
                      </time>
                    ),
                  },
                  ...(data.standsForPrimary.primary
                    ? [
                        {
                          label: 'Stands for',
                          value: (
                            <div className={styles.variants}>
                              <span className={`${styles.variant} ${styles.variantStrong}`}>
                                {data.standsForPrimary.primary}
                              </span>
                              {data.standsForPrimary.alternates.map((value) => (
                                <span key={value} className={styles.variant}>
                                  {value}
                                </span>
                              ))}
                            </div>
                          ),
                        },
                      ]
                    : []),
                  ...(data.alsoKnownAs.length
                    ? [
                        {
                          label: 'Also known as',
                          value: (
                            <div className={styles.variants}>
                              {data.alsoKnownAs.map((value) => (
                                <span key={value} className={styles.variant}>
                                  {value}
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
                          value: <TagList entryTags={entry.entryTags} />,
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
                  {entry.senses.map((sense, index) => {
                    return (
                      <SenseCard
                        key={sense.id}
                        sense={sense}
                        entryType={entryType}
                        openByDefault={entry.senses.length === 1 || index === 0}
                        provenanceItems={data.provenanceBySenseId.get(sense.id) ?? []}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {data.related.length || data.seeAlso.length ? (
            <section className={styles.relations} aria-label="Related entries">
              <RelationList
                title="Related"
                relationships={data.related}
                summaryById={data.otherSummaryById}
              />
              <RelationList
                title="See also"
                relationships={data.seeAlso}
                summaryById={data.otherSummaryById}
              />
            </section>
          ) : null}
        </div>

        <StickySenseToc items={data.tocItems} />
      </div>
    </>
  );
}
