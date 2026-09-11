import Link from 'next/link';

import { CitationPill } from '@/components/CitationPill';
import { CiteSenseButton } from '@/components/CiteSenseButton';
import { CopyLinkButton } from '@/components/CopyLinkButton';
import { EntryPreviewLink } from '@/components/EntryPreviewLink';
import { EntrySenseHashSync } from '@/components/EntrySenseHashSync';
import { Markdown } from '@/components/Markdown';
import { SenseCard } from '@/components/SenseCard';
import { SenseConcordance } from '@/components/SenseConcordance';
import { SenseProvenance } from '@/components/SenseProvenance';
import { SenseTocChips, StickySenseToc } from '@/components/StickySenseToc';
import { TypeBadge } from '@/components/TypeBadge';
import { KeyValueList } from '@/components/ui/KeyValue';
import styles from '@/app/_styles/Entry.module.css';
import { buildSenseCitationStrings } from '@/lib/publicCitation';
import type {
  PublicEntryPageData,
  PublicEntryRelation,
  PublicEntrySenseView,
  PublicEntryTagLink,
} from '@/lib/publicEntryPage';
import { formatDate, toIsoString } from '@/lib/publicFormat';
import { formatContentMode } from '@/lib/publicLabels';
import { buildEntryJsonLd, serializeJsonLd } from '@/lib/publicJsonLd';
import { getSiteUrl } from '@/lib/sitemap';

const ISSUE_TEMPLATE_URL = 'https://github.com/amanthanvi/synac/issues/new';

function reportHref(input: { title: string; url: string }): string {
  const params = new URLSearchParams({
    template: 'content_correction.yml',
    title: `Correction: ${input.title}`,
    url: input.url,
  });
  return `${ISSUE_TEMPLATE_URL}?${params.toString()}`;
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
    <div>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.relationList}>
        {relationships.map((relationship) => {
          const href =
            relationship.otherEntry.entryType === 'TERM'
              ? `/term/${relationship.otherEntry.primarySlug}`
              : `/acronym/${relationship.otherEntry.primarySlug}`;

          return (
            <li
              key={`${relationship.relationshipType}-${relationship.otherEntry.id}`}
            >
              <EntryPreviewLink
                href={href}
                title={relationship.otherEntry.displayTitle}
                entryType={relationship.otherEntry.entryType}
                summary={summaryById.get(relationship.otherEntry.id) ?? null}
                note={relationship.note}
              />
              {relationship.note ? (
                <p className={styles.relationNote}>{relationship.note}</p>
              ) : null}
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

function SenseBody({
  sense,
  entryTitle,
  entrySlug,
  canonicalUrl,
}: {
  sense: PublicEntrySenseView;
  entryTitle: string;
  entrySlug: string;
  canonicalUrl: string;
}) {
  const senseUrl = `${canonicalUrl}${sense.fragment}`;
  const citation = buildSenseCitationStrings({
    entryTitle,
    entrySlug,
    senseLabel: sense.label,
    senseSlug: sense.slug,
    senseId: sense.id,
    url: senseUrl,
    sourceNames: sense.bibliography.map((item) => item.citation.source.name),
    accessedAt: sense.bibliography[0]?.citation.accessedAt ?? null,
  });

  return (
    <>
      {sense.disambiguationNote ? (
        <p className={styles.senseNote}>{sense.disambiguationNote}</p>
      ) : null}

      <div className={styles.senseBody}>
        {sense.definitionMd ? (
          <Markdown>{sense.definitionMd}</Markdown>
        ) : sense.definitionText ? (
          <p>{sense.definitionText}</p>
        ) : (
          <p className={styles.senseMuted}>No definition yet.</p>
        )}
      </div>

      {sense.bibliography.length ? (
        <div className={styles.inlineSources} aria-label="Sources">
          {sense.bibliography.map(({ citation: ref, contentMode }) => (
            <CitationPill
              key={ref.id}
              sourceName={ref.source.name}
              url={ref.url}
              accessedAtLabel={formatDate(ref.accessedAt)}
              documentTitle={ref.sourceDocument.title}
              licenseStatement={
                ref.source.licensePublicStatement ?? ref.licenseNote
              }
              licenseUrl={ref.source.licenseUrl}
              attributionText={ref.attributionText}
              contentModeLabel={formatContentMode(contentMode)}
              sourceHref={`/sources/${ref.source.sourceSlug}`}
            />
          ))}
        </div>
      ) : null}

      <SenseConcordance attestations={sense.attestations} />

      {sense.examples.length ? (
        <div className={styles.examples}>
          <h4 className={styles.sectionTitle}>Examples</h4>
          <ul className={styles.examplesList}>
            {sense.examples.map((example) => (
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

      <SenseProvenance
        attestations={sense.attestations}
        provenance={sense.provenance}
      />

      <div className={styles.bib} aria-label="Bibliography">
        <h4 className={styles.sectionTitle}>Bibliography</h4>
        {sense.bibliography.length === 0 ? (
          <div className={styles.senseMuted}>
            No references recorded for this sense yet.
          </div>
        ) : (
          <ol className={styles.bibList}>
            {sense.bibliography.map(({ citation: ref, contentMode }) => (
              <li key={ref.id} className={styles.bibItem}>
                <div className={styles.bibSource}>{ref.source.name}</div>
                <div className={styles.bibMeta}>
                  <span>Accessed {formatDate(ref.accessedAt)}</span>
                  <span>{formatContentMode(contentMode)}</span>
                </div>
                {ref.sourceDocument.title ? (
                  <div className={styles.bibDocTitle}>
                    {ref.sourceDocument.title}
                  </div>
                ) : null}
                <a
                  className={styles.bibUrl}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.url}
                </a>
                {ref.source.licensePublicStatement ||
                ref.licenseNote ||
                ref.attributionText ? (
                  <div className={styles.bibNote}>
                    {ref.source.licensePublicStatement ? (
                      <div>{ref.source.licensePublicStatement}</div>
                    ) : ref.licenseNote ? (
                      <div>{ref.licenseNote}</div>
                    ) : null}
                    {ref.attributionText ? (
                      <div>{ref.attributionText}</div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className={styles.senseTools}>
        <CopyLinkButton
          path={`${new URL(senseUrl).pathname}${sense.fragment}`}
        />
        <CiteSenseButton
          bibtex={citation.bibtex}
          plain={citation.plain}
          jsonHref={citation.jsonHref}
        />
        <a
          className={styles.reportLink}
          href={reportHref({
            title: `${entryTitle} — ${sense.label}`,
            url: senseUrl,
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          Report
        </a>
      </div>
    </>
  );
}

export function PublicEntryPage({ data }: { data: PublicEntryPageData }) {
  const { entry, entryType, senses } = data;
  const canonicalUrl = `${getSiteUrl()}${data.canonicalPath}`;

  const senseIdByFragment: Record<string, string> = {};
  for (const sense of senses) {
    senseIdByFragment[sense.fragment] = sense.id;
    senseIdByFragment[`#sense-${sense.id}`] = sense.id;
  }

  const jsonLd = serializeJsonLd(
    buildEntryJsonLd({
      url: canonicalUrl,
      name: entry.displayTitle,
      description: entry.summaryText,
      senses: senses.map((sense) => ({
        name: sense.label,
        description: sense.excerpt,
        url: `${canonicalUrl}${sense.fragment}`,
        citations: sense.bibliography.map(({ citation }) => ({
          url: citation.url,
          name: citation.sourceDocument.title ?? citation.source.name,
          publisher: citation.source.name,
        })),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <header className={styles.header}>
            <div className={styles.badgeRow}>
              <TypeBadge entryType={entryType} size="md" />
            </div>
            <h1 className={styles.title}>{entry.displayTitle}</h1>

            {data.showHeaderSummary ? (
              entry.summaryMd ? (
                <div className={styles.summary}>
                  <Markdown>{entry.summaryMd}</Markdown>
                </div>
              ) : (
                <p className={styles.summary}>{entry.summaryText}</p>
              )
            ) : null}

            <div className={styles.meta}>
              <KeyValueList
                items={[
                  {
                    label: 'Updated',
                    value: (
                      <time
                        className={styles.updated}
                        dateTime={toIsoString(entry.updatedAt)}
                      >
                        {formatDate(entry.updatedAt)}
                      </time>
                    ),
                  },
                  ...(data.standsForPrimary.primary
                    ? [
                        {
                          label: 'Stands for',
                          value: (
                            <div className={styles.variants}>
                              <span
                                className={`${styles.variant} ${styles.variantStrong}`}
                              >
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
            {senses.length === 0 ? (
              <p className={styles.senseMuted}>No published senses yet.</p>
            ) : (
              <div data-senses>
                <EntrySenseHashSync
                  senseIdByFragment={senseIdByFragment}
                  collapseOthers={senses.length >= 10}
                />
                <SenseTocChips items={data.tocItems} />
                <div className={styles.senseList}>
                  {senses.map((sense, index) => (
                    <SenseCard
                      key={sense.id}
                      senseId={sense.id}
                      elementId={sense.elementId}
                      slugAnchorId={sense.slugAnchorId}
                      senseSlug={sense.slug}
                      label={sense.label}
                      needsLabel={sense.needsLabel}
                      expandedForm={
                        entryType === 'ACRONYM' ? sense.expandedForm : null
                      }
                      excerpt={sense.excerpt}
                      defaultOpen={senses.length === 1 || index === 0}
                    >
                      <SenseBody
                        sense={sense}
                        entryTitle={entry.displayTitle}
                        entrySlug={entry.primarySlug}
                        canonicalUrl={canonicalUrl}
                      />
                    </SenseCard>
                  ))}
                </div>
              </div>
            )}
          </section>

          {data.relationsByType.length ? (
            <section className={styles.relations} aria-label="Related entries">
              {data.relationsByType.map((section) => (
                <RelationList
                  key={section.type}
                  title={section.title}
                  relationships={section.items}
                  summaryById={data.otherSummaryById}
                />
              ))}
            </section>
          ) : null}

          <div className={styles.entryFooter}>
            <a
              className={styles.reportLink}
              href={reportHref({
                title: entry.displayTitle,
                url: canonicalUrl,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Report a problem with this entry
            </a>
          </div>
        </div>

        <StickySenseToc items={data.tocItems} />
      </div>
    </>
  );
}
