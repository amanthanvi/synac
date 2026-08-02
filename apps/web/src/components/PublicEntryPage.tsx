import Link from 'next/link';

import { EntryPreviewLink } from '@/components/EntryPreviewLink';
import { Markdown } from '@/components/Markdown';
import { StickySenseToc } from '@/components/StickySenseToc';
import { ViewTracker } from '@/components/ViewTracker';
import { TypeMarker } from '@/components/ui/TypeMarker';
import styles from '@/app/_styles/Entry.module.css';
import {
  dedupeSenseCitations,
  formatEntryDate,
  senseAnchorId,
  type PublicEntryPageData,
  type PublicEntryRelation,
  type PublicEntrySense,
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

function RelationList({
  title,
  relationships,
}: {
  title: string;
  relationships: PublicEntryRelation[];
}) {
  if (relationships.length === 0) return null;

  return (
    <div className={styles.relationGroup}>
      <h2 className={styles.relationTitle}>{title}</h2>
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

function SenseSources({ sense }: { sense: PublicEntrySense }) {
  const citations = dedupeSenseCitations(sense.citations);
  if (citations.length === 0) return null;

  return (
    <div className={styles.sources} aria-label="Sources">
      <div className={styles.sourcesLabel}>{citations.length === 1 ? 'Source' : 'Sources'}</div>
      <ul className={styles.sourceList}>
        {citations.map((citation) => {
          const url = externalHttpUrl(citation.url);
          return (
            <li key={`${citation.sourceSlug}:${citation.url}`} className={styles.sourceItem}>
              <div className={styles.sourceLine}>
                {url ? (
                  <a
                    className={styles.sourceName}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {citation.sourceName}
                  </a>
                ) : (
                  <span className={styles.sourceName}>{citation.sourceName}</span>
                )}
                {citation.documentTitle ? (
                  <span className={styles.sourceDoc}>{citation.documentTitle}</span>
                ) : null}
              </div>
              <div className={styles.sourceMeta}>
                accessed {formatEntryDate(new Date(citation.accessedAt))}
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
}: {
  sense: PublicEntrySense;
  showNumber: boolean;
}) {
  const heading = sense.label ?? sense.expandedForm;
  const headingDetail =
    sense.label &&
    sense.expandedForm &&
    sense.expandedForm.trim().toLowerCase() !== sense.label.trim().toLowerCase()
      ? sense.expandedForm
      : null;

  return (
    <li
      id={senseAnchorId(sense)}
      className={showNumber ? styles.sense : `${styles.sense} ${styles.senseSolo}`}
    >
      {showNumber ? (
        <span className={styles.senseNumber} aria-hidden="true">
          {sense.order + 1}
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

        {sense.examples.length ? (
          <div className={styles.examples}>
            <div className={styles.examplesLabel}>
              {sense.examples.length === 1 ? 'Example' : 'Examples'}
            </div>
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
          <div className={styles.sourceNote} aria-label="Editorial note">
            <strong>Editorial note:</strong> {sense.editorialRationale}
          </div>
        ) : null}

        <SenseSources sense={sense} />
      </div>
    </li>
  );
}

export function PublicEntryPage({ entryType, data }: PublicEntryPageProps) {
  const { entry } = data;
  const updatedAt = new Date(entry.updatedAt);
  const senseExpansions = new Set(
    entry.senses
      .map((sense) => sense.expandedForm?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const standsForValues = [
    ...(data.standsForPrimary.primary ? [data.standsForPrimary.primary] : []),
    ...data.standsForPrimary.alternates,
  ].filter((value) => !senseExpansions.has(value.trim().toLowerCase()));

  const summaryComparable = comparableText(entry.summaryMd ?? entry.summaryText);
  const firstSenseComparable =
    entry.senses.length === 1
      ? comparableText(entry.senses[0]!.definitionMd ?? entry.senses[0]!.definitionText)
      : '';
  const summaryDuplicatesSense =
    Boolean(summaryComparable) &&
    Boolean(firstSenseComparable) &&
    (firstSenseComparable.startsWith(summaryComparable) || summaryComparable === firstSenseComparable);
  const showLede = Boolean(entry.summaryMd || entry.summaryText) && !summaryDuplicatesSense;
  const showToc = entry.senses.length >= 3;

  return (
    <>
      <ViewTracker entryKey={entry.key} />
      <article className={showToc ? styles.layoutWithToc : styles.layout}>
        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{entry.title}</h1>
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
                {entry.summaryMd ? <Markdown>{entry.summaryMd}</Markdown> : <p>{entry.summaryText}</p>}
              </div>
            ) : null}

            <div className={styles.meta}>
              {entry.tags.length ? (
                <span className={styles.metaTags}>
                  {entry.tags.map((tag, index) => (
                    <span key={tag.slug}>
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
                <time dateTime={updatedAt.toISOString()}>{formatEntryDate(updatedAt)}</time>
              </span>
            </div>
          </header>

          <section aria-label="Senses">
            {entry.senses.length === 0 ? (
              <p className={styles.muted}>No published senses yet.</p>
            ) : (
              <ol className={styles.senseList}>
                {entry.senses.map((sense) => (
                  <Sense key={sense.key} sense={sense} showNumber={entry.senses.length > 1} />
                ))}
              </ol>
            )}
          </section>

          {data.related.length || data.seeAlso.length ? (
            <section className={styles.relations} aria-label="Related entries">
              <RelationList title="Related" relationships={data.related} />
              <RelationList title="See also" relationships={data.seeAlso} />
            </section>
          ) : null}
        </div>

        {showToc ? (
          <div className={styles.rail}>
            <div className={styles.railInner}>
              <StickySenseToc items={data.tocItems} />
            </div>
          </div>
        ) : null}
      </article>
    </>
  );
}
