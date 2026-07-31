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
  dedupeSenseCitations,
  formatEntryDate,
  senseAnchorId,
  type PublicEntryPageData,
  type PublicEntryRelation,
  type PublicEntrySense,
} from '@/lib/publicEntryPage';

type PublicEntryPageProps = {
  entryType: 'TERM' | 'ACRONYM';
  data: PublicEntryPageData;
};

function RelationList({
  title,
  relationships,
}: {
  title: string;
  relationships: PublicEntryRelation[];
}) {
  if (relationships.length === 0) return null;

  return (
    <div>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.relationList}>
        {relationships.map((relationship) => {
          const other = relationship.entry;
          const href = other.entryType === 'TERM' ? `/term/${other.slug}` : `/acronym/${other.slug}`;
          return (
            <li key={other.key}>
              <EntryPreviewLink
                href={href}
                title={other.title}
                entryType={other.entryType}
                summary={other.summaryText}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TagList({ tags }: { tags: Array<{ slug: string; name: string }> }) {
  return (
    <div className={styles.tags}>
      {tags.map((tag) => (
        <Link key={tag.slug} href={`/tags/${tag.slug}`} className={styles.tag}>
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
}: {
  sense: PublicEntrySense;
  entryType: 'TERM' | 'ACRONYM';
  openByDefault: boolean;
}) {
  const citations = dedupeSenseCitations(sense.citations);
  const excerpt = sense.definitionText.replace(/\s+/g, ' ').trim() || 'No definition yet.';

  return (
    <details id={senseAnchorId(sense)} className={styles.senseCard} open={openByDefault} data-sense>
      <summary className={styles.senseSummary}>
        <div className={styles.senseSummaryTop}>
          <span className={styles.senseLabel}>{sense.label ?? `Sense ${sense.order + 1}`}</span>
          {entryType === 'ACRONYM' && sense.expandedForm ? (
            <span className={styles.senseExpanded}>{sense.expandedForm}</span>
          ) : null}
          {sense.isEditorial ? <span className={styles.senseExpanded}>Editorial</span> : null}
          <span className={styles.senseChevron} aria-hidden="true">
            ▾
          </span>
        </div>
        <div className={styles.senseExcerpt}>{excerpt}</div>
      </summary>

      <div className={styles.senseContent}>
        <div className={styles.senseContentInner}>
          <div className={styles.senseBody}>
            <Markdown>{sense.definitionMd}</Markdown>
          </div>

          {citations.length ? (
            <div className={styles.inlineSources} aria-label="Sources">
              {citations.map((citation) => (
                <CitationPill
                  key={`${citation.sourceSlug}:${citation.url}`}
                  sourceName={citation.sourceName}
                  url={citation.url}
                  accessedAtLabel={formatEntryDate(new Date(citation.accessedAt))}
                  documentTitle={citation.documentTitle ?? null}
                  licenseNote={citation.licenseNote ?? null}
                  attributionText={citation.attributionText}
                />
              ))}
            </div>
          ) : null}

          {sense.examples.length ? (
            <div className={styles.examples}>
              <div className={styles.sectionTitle}>Examples</div>
              <ul className={styles.examplesList}>
                {sense.examples.map((example) => (
                  <li key={example.md} className={styles.exampleItem}>
                    <Markdown>{example.md}</Markdown>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sense.isEditorial && sense.editorialRationale ? (
            <div className={styles.bib} aria-label="Editorial note">
              <div className={styles.sectionTitle}>Editorial note</div>
              <div className={styles.senseMuted}>{sense.editorialRationale}</div>
            </div>
          ) : null}

          <div className={styles.bib} aria-label="Bibliography">
            <div className={styles.sectionTitle}>Bibliography</div>
            {citations.length === 0 ? (
              <div className={styles.senseMuted}>
                {sense.isEditorial
                  ? 'Editorial sense — maintained in the SynAc repository.'
                  : 'No references recorded for this sense yet.'}
              </div>
            ) : (
              <ol className={styles.bibList}>
                {citations.map((citation) => (
                  <li key={`${citation.sourceSlug}:${citation.url}`} className={styles.bibItem}>
                    <div className={styles.bibSource}>{citation.sourceName}</div>
                    <div className={styles.bibMeta}>
                      <span>Accessed {formatEntryDate(new Date(citation.accessedAt))}</span>
                      {citation.citationText ? <span>{citation.citationText}</span> : null}
                    </div>
                    {citation.documentTitle ? (
                      <div className={styles.bibDocTitle}>{citation.documentTitle}</div>
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
  const updatedAt = new Date(entry.updatedAt);

  return (
    <>
      <ViewTracker entryKey={entry.key} />
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
            <h1 className={styles.title}>{entry.title}</h1>
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
                      <time className={styles.updated} dateTime={updatedAt.toISOString()}>
                        {formatEntryDate(updatedAt)}
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
                  ...(entry.tags.length
                    ? [
                        {
                          label: 'Tags',
                          value: <TagList tags={entry.tags} />,
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
                  {entry.senses.map((sense, index) => (
                    <SenseCard
                      key={sense.key}
                      sense={sense}
                      entryType={entryType}
                      openByDefault={entry.senses.length === 1 || index === 0}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          {data.related.length || data.seeAlso.length ? (
            <section className={styles.relations} aria-label="Related entries">
              <RelationList title="Related" relationships={data.related} />
              <RelationList title="See also" relationships={data.seeAlso} />
            </section>
          ) : null}
        </div>

        <StickySenseToc items={data.tocItems} />
      </div>
    </>
  );
}
