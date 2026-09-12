import { senseAnchorId } from '@synac/shared';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Fragment } from 'react';

import { EntryRelationLink } from '@/components/EntryRelationLink';
import { Markdown } from '@/components/Markdown';
import { SenseNav } from '@/components/SenseNav';
import { SensePermalink } from '@/components/SensePermalink';
import { TypeMarker } from '@/components/ui/TypeMarker';
import styles from '@/app/_styles/Entry.module.css';
import type {
  EntryType,
  PublicEntryRelation,
  PublicEntrySense,
  PublicSenseCitation,
} from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { buildEntryJsonLd, renderJsonLd } from '@/lib/jsonLd';
import {
  dedupeSenseCitations,
  entryPath,
  senseHeadingText,
  type PublicEntryPageData,
} from '@/lib/publicEntryPage';
import { diffWords } from '@/lib/textDiff';

const REPO_URL = 'https://github.com/amanthanvi/synac';

const CONTENT_MODE_WORDS = {
  QUOTED: 'Quoted',
  SUMMARIZED: 'Summarized',
  PARAPHRASED: 'Paraphrased',
} as const;

type PublicEntryPageProps = {
  entryType: EntryType;
  data: PublicEntryPageData;
};

type SenseContext = {
  entryType: EntryType;
  entryTitle: string;
  entrySlug: string;
  canonicalUrl: string;
};

function typeSegment(entryType: EntryType): 'term' | 'acronym' {
  return entryType === 'TERM' ? 'term' : 'acronym';
}

function externalHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function contentModeWord(
  citation: Pick<PublicSenseCitation, 'contentMode'>,
): string {
  return CONTENT_MODE_WORDS[citation.contentMode];
}

function reportIssueUrl(input: {
  title: string;
  entryUrl: string;
  senseUrl?: string;
}): string {
  // Field ids come from .github/ISSUE_TEMPLATE/content_correction.yml.
  const params = new URLSearchParams({
    template: 'content_correction.yml',
    title: `Correction: ${input.title}`,
    url: input.entryUrl,
  });
  if (input.senseUrl) params.set('sense', input.senseUrl);
  return `${REPO_URL}/issues/new?${params}`;
}

/** BibTeX keys allow neither spaces nor punctuation runs. */
function bibtexKey(sourceSlug: string, senseKey: string): string {
  const slug = (value: string) =>
    value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const source = slug(sourceSlug);
  const sense = slug(senseKey);
  // Sense keys are already namespaced by their source slug; do not repeat it.
  return sense.startsWith(`${source}-`)
    ? `synac-${sense}`
    : `synac-${source}-${sense}`;
}

function bibtexValue(value: string): string {
  // One pass so a backslash is never escaped twice.
  return value.replace(/[\\{}$&#_%~^]/g, (char) =>
    char === '\\' ? '\\textbackslash ' : `\\${char}`,
  );
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function SourceNote({ citation }: { citation: PublicSenseCitation }) {
  const statement = citation.publicStatement ?? citation.licenseNote ?? null;
  const licenseUrl = citation.licenseUrl
    ? externalHttpUrl(citation.licenseUrl)
    : null;
  if (!statement && !citation.attributionText) return null;

  return (
    <div className={styles.sourceNote}>
      {statement ? (
        <div>
          {licenseUrl ? (
            <a
              className={styles.noteLink}
              href={licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {statement}
            </a>
          ) : (
            statement
          )}
        </div>
      ) : null}
      {citation.attributionText ? <div>{citation.attributionText}</div> : null}
    </div>
  );
}

function SenseSources({ sense }: { sense: PublicEntrySense }) {
  const citations = dedupeSenseCitations(sense.citations);
  if (citations.length === 0) return null;

  return (
    <div className={styles.sources}>
      <div className={styles.sourcesLabel}>
        {citations.length === 1 ? 'Source' : 'Sources'}
      </div>
      <ul className={styles.sourceList}>
        {citations.map((citation) => {
          const url = externalHttpUrl(citation.url);
          return (
            <li
              key={`${citation.sourceSlug}:${citation.url}`}
              className={styles.sourceItem}
            >
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
                  <span className={styles.sourceName}>
                    {citation.sourceName}
                  </span>
                )}
                {citation.documentTitle ? (
                  <span className={styles.sourceDoc}>
                    {citation.documentTitle}
                  </span>
                ) : null}
              </div>
              <div className={styles.sourceMeta}>
                {contentModeWord(citation)}, accessed{' '}
                {formatDate(new Date(citation.accessedAt))}
              </div>
              {citation.citationText || citation.locator ? (
                <div className={styles.sourceMeta}>
                  {citation.citationText ? (
                    <span>{citation.citationText}</span>
                  ) : null}
                  {citation.locator ? (
                    <span className={styles.locator}>{citation.locator}</span>
                  ) : null}
                </div>
              ) : null}
              <SourceNote citation={citation} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SenseAttestations({ sense }: { sense: PublicEntrySense }) {
  if (sense.attestations.length === 0) return null;

  return (
    <div className={styles.sources}>
      <div className={styles.sourcesLabel}>Also defined by</div>
      <ul className={styles.sourceList}>
        {sense.attestations.map((attestation) => {
          const url = externalHttpUrl(attestation.citation.url);
          return (
            <li key={attestation.key} className={styles.sourceItem}>
              <div className={styles.sourceLine}>
                {url ? (
                  <a
                    className={styles.sourceName}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {attestation.sourceName}
                  </a>
                ) : (
                  <span className={styles.sourceName}>
                    {attestation.sourceName}
                  </span>
                )}
              </div>
              <div className={styles.sourceMeta}>
                {contentModeWord(attestation.citation)}, accessed{' '}
                {formatDate(new Date(attestation.citation.accessedAt))}
              </div>
            </li>
          );
        })}
      </ul>

      <details className={styles.disclosure}>
        <summary className={styles.disclosureSummary}>Compare wording</summary>
        <div className={styles.disclosureBody}>
          {sense.attestations.map((attestation) => (
            <div key={attestation.key} className={styles.compareItem}>
              <div className={styles.compareSource}>
                {attestation.sourceName}
              </div>
              <p className={styles.compareText}>
                {diffWords(
                  sense.definitionText,
                  attestation.definitionText,
                ).map((token, index) => (
                  <Fragment key={index}>
                    {token.changed ? <mark>{token.text}</mark> : token.text}
                  </Fragment>
                ))}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function SenseCite({
  sense,
  context,
  heading,
  senseUrl,
}: {
  sense: PublicEntrySense;
  context: SenseContext;
  heading: string;
  senseUrl: string;
}) {
  const citation = dedupeSenseCitations(sense.citations)[0];
  if (!citation) return null;

  const accessed = new Date(citation.accessedAt);
  const mode = contentModeWord(citation);
  const plainCitation = [
    `${citation.sourceName}.`,
    citation.documentTitle ? `${citation.documentTitle}.` : null,
    `In SynAc, ${context.entryTitle}, sense "${heading}".`,
    `Accessed ${formatDate(accessed)}.`,
    senseUrl,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');

  const bibtex = [
    `@misc{${bibtexKey(citation.sourceSlug, sense.key)},`,
    `  title        = {${bibtexValue(context.entryTitle)}, sense "${bibtexValue(heading)}"},`,
    `  author       = {${bibtexValue(citation.sourceName)}},`,
    `  howpublished = {SynAc},`,
    `  url          = {${senseUrl}},`,
    `  urldate      = {${isoDay(accessed)}},`,
    `  note         = {${mode} from ${bibtexValue(citation.sourceName)}}`,
    `}`,
  ].join('\n');

  const jsonHref = `/api/v1/senses/citation.json?type=${typeSegment(context.entryType)}&slug=${encodeURIComponent(context.entrySlug)}&sense=${encodeURIComponent(sense.key)}`;

  return (
    <details className={styles.disclosure}>
      <summary className={styles.disclosureSummary}>Cite</summary>
      <div className={styles.disclosureBody}>
        <p className={styles.citeLine}>{plainCitation}</p>
        <div className={styles.codeScroll}>
          <pre className={styles.code}>{bibtex}</pre>
        </div>
        <a className={styles.metaLink} href={jsonHref}>
          Citation record (JSON)
        </a>
      </div>
    </details>
  );
}

function Sense({
  sense,
  showNumber,
  context,
}: {
  sense: PublicEntrySense;
  showNumber: boolean;
  context: SenseContext;
}) {
  const anchor = senseAnchorId(sense.key);
  const senseUrl = `${context.canonicalUrl}#${anchor}`;
  const heading = senseHeadingText(sense, context.entryType);
  const headingDetail =
    sense.label &&
    sense.expandedForm &&
    sense.expandedForm.trim().toLowerCase() !== sense.label.trim().toLowerCase()
      ? sense.expandedForm
      : null;

  return (
    <li
      id={anchor}
      className={
        showNumber ? styles.sense : `${styles.sense} ${styles.senseSolo}`
      }
    >
      {showNumber ? (
        <span className={styles.senseNumber} aria-hidden="true">
          {sense.order + 1}
        </span>
      ) : null}
      <div className={styles.senseBody}>
        <h2 className={styles.senseHeading}>
          {heading}
          {headingDetail ? (
            <span className={styles.senseHeadingDetail}>
              {' '}
              · {headingDetail}
            </span>
          ) : null}
          <SensePermalink url={senseUrl} />
        </h2>

        {sense.disambiguationNote ? (
          <p className={styles.senseNote}>{sense.disambiguationNote}</p>
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

        <SenseAttestations sense={sense} />
        <SenseSources sense={sense} />

        <div className={styles.senseFoot}>
          <SenseCite
            sense={sense}
            context={context}
            heading={heading}
            senseUrl={senseUrl}
          />
          <a
            className={styles.metaLink}
            href={reportIssueUrl({
              title: context.entryTitle,
              entryUrl: context.canonicalUrl,
              senseUrl,
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            Report
          </a>
        </div>
      </div>
    </li>
  );
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
          return (
            <li key={other.key}>
              <EntryRelationLink
                href={entryPath(other.entryType, other.slug)}
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

export async function PublicEntryPage({
  entryType,
  data,
}: PublicEntryPageProps) {
  const { entry, canonicalUrl } = data;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
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

  // The compiler omits a summary that only repeats a sole sense, so anything
  // left here is worth showing.
  const showLede = entry.summaryText !== null;
  const showNav = entry.senses.length >= 2;
  const context: SenseContext = {
    entryType,
    entryTitle: entry.title,
    entrySlug: entry.slug,
    canonicalUrl,
  };

  const jsonLd = buildEntryJsonLd({
    url: canonicalUrl,
    name: entry.title,
    description: entry.summaryText,
    senses: entry.senses.map((sense) => ({
      name: senseHeadingText(sense, entry.entryType),
      description: sense.definitionText,
      url: `${canonicalUrl}#${senseAnchorId(sense.key)}`,
      citations: dedupeSenseCitations(sense.citations).map((citation) => ({
        url: citation.url,
        name: citation.sourceName,
        publisher: citation.sourceName,
        license: citation.licenseUrl ?? null,
      })),
    })),
  });

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
      />
      <article className={showNav ? styles.layoutWithToc : styles.layout}>
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
                {entry.summaryMd ? (
                  <Markdown>{entry.summaryMd}</Markdown>
                ) : (
                  <p>{entry.summaryText}</p>
                )}
              </div>
            ) : null}

            <div className={styles.meta}>
              {entry.tags.length ? (
                <span className={styles.metaTags}>
                  {entry.tags.map((tag, index) => (
                    <span key={tag.slug}>
                      {index > 0 ? ', ' : ''}
                      <Link
                        href={`/tags/${tag.slug}`}
                        className={styles.metaTagLink}
                      >
                        {tag.name}
                      </Link>
                    </span>
                  ))}
                </span>
              ) : null}
              <span className={styles.metaUpdated}>
                Updated{' '}
                <time dateTime={updatedAt.toISOString()}>
                  {formatDate(updatedAt)}
                </time>
              </span>
            </div>
          </header>

          {showNav ? <SenseNav items={data.navItems} variant="chips" /> : null}

          <section aria-label="Senses">
            {entry.senses.length === 0 ? (
              <p className={styles.muted}>No published senses yet.</p>
            ) : (
              <ol className={styles.senseList}>
                {entry.senses.map((sense) => (
                  <Sense
                    key={sense.key}
                    sense={sense}
                    showNumber={entry.senses.length > 1}
                    context={context}
                  />
                ))}
              </ol>
            )}
          </section>

          <div className={styles.entryMeta}>
            <a
              className={styles.metaLink}
              href={`${REPO_URL}/tree/main/content/overrides/${typeSegment(entryType)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit overrides on GitHub
            </a>
            <a
              className={styles.metaLink}
              href={reportIssueUrl({
                title: entry.title,
                entryUrl: canonicalUrl,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Report a problem
            </a>
          </div>

          {data.related.length ||
          data.seeAlso.length ||
          data.compareWith.length ? (
            <section className={styles.relations} aria-label="Related entries">
              <RelationList title="Related" relationships={data.related} />
              <RelationList title="See also" relationships={data.seeAlso} />
              <RelationList
                title="Compare with"
                relationships={data.compareWith}
              />
            </section>
          ) : null}
        </div>

        {showNav ? (
          <div className={styles.rail}>
            <div className={styles.railInner}>
              <SenseNav items={data.navItems} variant="rail" />
            </div>
          </div>
        ) : null}
      </article>
    </>
  );
}
