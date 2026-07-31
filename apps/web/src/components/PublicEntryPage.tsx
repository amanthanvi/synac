import Link from 'next/link';

import { EntryPreviewLink } from '@/components/EntryPreviewLink';
import { Markdown } from '@/components/Markdown';
import { StickySenseToc } from '@/components/StickySenseToc';
import { ViewTracker } from '@/components/ViewTracker';
import { TypeMarker } from '@/components/ui/TypeMarker';
import styles from '@/app/_styles/Entry.module.css';
import {
  buildSenseCitations,
  formatEntryDate,
  type PublicEntryExample,
  type PublicEntryRelation,
  type PublicEntrySense,
  type PublicEntryPageData,
  type PublicSenseProvenance,
} from '@/lib/publicEntryPage';
import { markdownToText } from '@/lib/text';

type PublicEntryPageProps = {
  entryType: 'TERM' | 'ACRONYM';
  data: PublicEntryPageData;
};

function externalHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function comparableText(value: string | null): string {
  if (!value) return '';
  return markdownToText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

function senseText(sense: PublicEntrySense): string {
  // Compare the field the sense actually renders (markdown first).
  return comparableText(sense.definitionMd ?? sense.definitionText);
}

function contentModeLabel(mode: PublicSenseProvenance['contentMode']): string {
  if (mode === 'QUOTED') return 'quoted';
  if (mode === 'PARAPHRASED') return 'paraphrased';
  return 'summarized';
}

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
    <div className={styles.relationGroup}>
      <h2 className={styles.relationTitle}>{title}</h2>
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

function SenseSources({ provenanceItems }: { provenanceItems: PublicSenseProvenance[] }) {
  const citations = buildSenseCitations(provenanceItems);
  if (citations.length === 0) return null;

  return (
    <div className={styles.sources} aria-label="Sources">
      <div className={styles.sourcesLabel}>
        {citations.length === 1 ? 'Source' : 'Sources'}
      </div>
      <ul className={styles.sourceList}>
        {citations.map(({ citation, contentMode }) => {
          const url = externalHttpUrl(citation.url);
          return (
          <li key={citation.id} className={styles.sourceItem}>
            <div className={styles.sourceLine}>
              {url ? (
                <a
                  className={styles.sourceName}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {citation.source.name}
                </a>
              ) : (
                <span className={styles.sourceDoc}>{citation.source.name}</span>
              )}
              {citation.sourceDocument.title ? (
                <span className={styles.sourceDoc}>{citation.sourceDocument.title}</span>
              ) : null}
            </div>
            <div className={styles.sourceMeta}>
              {contentModeLabel(contentMode)} · accessed {formatEntryDate(citation.accessedAt)}
            </div>
            {citation.licenseNote || citation.attributionText ? (
              <div className={styles.sourceNote}>
                {citation.licenseNote ? <div>{citation.licenseNote}</div> : null}
                {citation.attributionText ? <div>{citation.attributionText}</div> : null}
              </div>
            ) : null}
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sense({
  sense,
  showNumber,
  provenanceItems,
}: {
  sense: PublicEntrySense;
  showNumber: boolean;
  provenanceItems: PublicSenseProvenance[];
}) {
  // The authored label is the curator's disambiguator — it wins over the
  // expansion, which several senses of one acronym can share.
  const heading = sense.senseLabel ?? sense.expandedForm;
  const headingDetail =
    sense.senseLabel &&
    sense.expandedForm &&
    sense.expandedForm.trim().toLowerCase() !== sense.senseLabel.trim().toLowerCase()
      ? sense.expandedForm
      : null;
  const examples = sense.examples.filter(
    (example) => example.exampleMd?.trim() || example.exampleText?.trim(),
  );

  return (
    <li
      id={`sense-${sense.id}`}
      className={showNumber ? styles.sense : `${styles.sense} ${styles.senseSolo}`}
    >
      {showNumber ? (
        <span className={styles.senseNumber} aria-hidden="true">
          {sense.senseOrder + 1}
        </span>
      ) : null}
      <div className={styles.senseBody}>
        {heading ? (
          <h2 className={styles.senseHeading}>
            {heading}
            {headingDetail ? (
              <span className={styles.senseHeadingDetail}> · {headingDetail}</span>
            ) : null}
          </h2>
        ) : null}
        <div className={styles.senseDefinition}>
          {sense.definitionMd ? (
            <Markdown>{sense.definitionMd}</Markdown>
          ) : sense.definitionText ? (
            <p>{sense.definitionText}</p>
          ) : (
            <p className={styles.muted}>No definition yet.</p>
          )}
        </div>

        {examples.length ? (
          <div className={styles.examples}>
            <div className={styles.examplesLabel}>
              {examples.length === 1 ? 'Example' : 'Examples'}
            </div>
            <ul className={styles.examplesList}>
              {examples.map((example: PublicEntryExample) => (
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

        <SenseSources provenanceItems={provenanceItems} />
      </div>
    </li>
  );
}

export function PublicEntryPage({ entryType, data }: PublicEntryPageProps) {
  const { entry } = data;

  const senseExpansions = new Set(
    entry.senses
      .map((sense) => sense.expandedForm?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const standsForValues = [
    ...(data.standsForPrimary.primary ? [data.standsForPrimary.primary] : []),
    ...data.standsForPrimary.alternates,
  ].filter((value) => !senseExpansions.has(value.trim().toLowerCase()));

  // Hide the lede only when it clearly repeats the sole sense's definition.
  const summaryComparable = comparableText(entry.summaryMd ?? entry.summaryText);
  const firstSenseComparable = entry.senses.length === 1 ? senseText(entry.senses[0]!) : '';
  const summaryDuplicatesSense =
    Boolean(summaryComparable) &&
    Boolean(firstSenseComparable) &&
    (firstSenseComparable.startsWith(summaryComparable) ||
      summaryComparable === firstSenseComparable);
  const showLede = Boolean(entry.summaryMd || entry.summaryText) && !summaryDuplicatesSense;

  const tocItems = entry.senses.map((sense) => ({
    id: sense.id,
    label: sense.senseLabel ?? sense.expandedForm ?? `Sense ${sense.senseOrder + 1}`,
  }));
  const showToc = entry.senses.length >= 3;

  return (
    <>
      <ViewTracker entryId={entry.id} />
      <article className={showToc ? styles.layoutWithToc : styles.layout}>
        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{entry.displayTitle}</h1>
              <TypeMarker type={entryType} className={styles.typeMarker} />
            </div>

            {standsForValues.length ? (
              <p className={styles.standsFor}>{standsForValues.join(' · ')}</p>
            ) : null}

            {data.alsoKnownAs.length ? (
              <p className={styles.aka}>
                <span className={styles.akaLabel}>Also known as </span>
                {data.alsoKnownAs.join(', ')}
              </p>
            ) : null}

            {showLede ? (
              <div className={styles.lede}>
                {entry.summaryMd ? (
                  <Markdown>{entry.summaryMd}</Markdown>
                ) : (
                  <p>{entry.summaryText}</p>
                )}
              </div>
            ) : null}

            <div className={styles.meta}>
              {entry.entryTags.length ? (
                <span className={styles.metaTags}>
                  {entry.entryTags.map(({ tag }, index) => (
                    <span key={tag.id}>
                      {index > 0 ? ', ' : ''}
                      <Link href={`/tags/${tag.slug}`} className={styles.metaTagLink}>
                        {tag.name}
                      </Link>
                    </span>
                  ))}
                </span>
              ) : null}
              <span className={styles.metaUpdated}>
                Updated{' '}
                <time dateTime={entry.updatedAt.toISOString()}>
                  {formatEntryDate(entry.updatedAt)}
                </time>
              </span>
            </div>
          </header>

          <section aria-label="Senses">
            {entry.senses.length === 0 ? (
              <p className={styles.muted}>No published senses yet.</p>
            ) : (
              <ol className={styles.senseList}>
                {entry.senses.map((sense) => (
                  <Sense
                    key={sense.id}
                    sense={sense}
                    showNumber={entry.senses.length > 1}
                    provenanceItems={data.provenanceBySenseId.get(sense.id) ?? []}
                  />
                ))}
              </ol>
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

        {showToc ? (
          <div className={styles.rail}>
            <div className={styles.railInner}>
              <StickySenseToc items={tocItems} />
            </div>
          </div>
        ) : null}
      </article>
    </>
  );
}
