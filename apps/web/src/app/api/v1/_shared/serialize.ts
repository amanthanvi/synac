/**
 * Wire format for the public read API.
 *
 * Two rules shape everything here:
 *
 * 1. A definition never travels without its citation. Every sense carries the
 *    full attestation list (source name, canonical URL, licence statement,
 *    attribution, content mode), so a consumer inherits the attribution
 *    obligation automatically instead of having to go looking for it.
 * 2. Dates are ISO strings and ids are opaque. The DB row shapes are an
 *    implementation detail; this module is the contract.
 *
 * `_shared` is a private folder: the leading underscore keeps App Router from
 * treating it as a route segment.
 */
import type {
  PublicApiEntry,
  PublicApiEntryListItem,
  PublicApiSense,
  PublicApiSource,
  PublicApiTag,
  PublicAttestation,
  PublicCitationRef,
  PublicSenseCitationRecord,
} from '@synac/db';

/**
 * The editorial layer (summaries, sense labels, curation, relationships) is
 * ours to license; the attested wording under each sense is not. Say both,
 * every time, rather than implying a single blanket licence.
 */
export const LICENSE = {
  editorial: {
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    statement:
      'SynAc editorial content (summaries, sense labels, disambiguation notes, curation and relationships) is licensed CC BY 4.0. Attribution: SynAc, https://synac.app.',
  },
  attestations: {
    statement:
      'Each source-attested definition is governed by the licence of its own source. See senses[].citations[].source for the licence, licence URL, and required attribution of every attestation.',
  },
} as const;

export function entryPath(entryType: string, slug: string): string {
  return entryType === 'ACRONYM' ? `/acronym/${slug}` : `/term/${slug}`;
}

/** Deep-link to a specific meaning. The fragment convention is `#s-<slug>`. */
export function sensePath(
  entryType: string,
  entrySlug: string,
  senseSlug: string | null,
): string {
  const base = entryPath(entryType, entrySlug);
  return senseSlug ? `${base}#s-${senseSlug}` : base;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

type SerializedSource = {
  id: string;
  name: string;
  slug: string;
  url: string;
  trustTier: string;
  licenseType: string;
  licenseUrl: string | null;
  licenseStatement: string | null;
  attributionHtml: string | null;
  attributionRequirements: string;
};

function serializeSourceRef(
  source: PublicCitationRef['source'],
): SerializedSource {
  return {
    id: source.id,
    name: source.name,
    slug: source.sourceSlug,
    url: source.baseUrl,
    trustTier: source.trustTier,
    licenseType: source.licenseType,
    licenseUrl: source.licenseUrl,
    licenseStatement: source.licensePublicStatement,
    attributionHtml: source.attributionHtml,
    attributionRequirements: source.attributionRequirements,
  };
}

type SerializedCitation = {
  id: string;
  url: string;
  citationText: string | null;
  licenseNote: string | null;
  attributionText: string | null;
  accessedAt: string | null;
  document: {
    id: string;
    title: string | null;
    url: string;
    canonicalUrl: string | null;
    contentSha256: string;
    fetchedAt: string | null;
  };
  source: SerializedSource;
};

function serializeCitation(citation: PublicCitationRef): SerializedCitation {
  return {
    id: citation.id,
    url: citation.url,
    citationText: citation.citationText,
    licenseNote: citation.licenseNote,
    attributionText: citation.attributionText,
    accessedAt: iso(citation.accessedAt),
    document: {
      id: citation.sourceDocument.id,
      title: citation.sourceDocument.title,
      url: citation.sourceDocument.url,
      canonicalUrl: citation.sourceDocument.canonicalUrl,
      contentSha256: citation.sourceDocument.contentSha256,
      fetchedAt: iso(citation.sourceDocument.fetchedAt),
    },
    source: serializeSourceRef(citation.source),
  };
}

/**
 * An attestation is a citation, from a consumer's point of view: the wording
 * one source gave this meaning, plus everything needed to check and attribute
 * it. So the citation fields are inlined rather than nested under `.citation`,
 * which would read as `citations[0].citation.source`.
 */
type SerializedAttestation = SerializedCitation & {
  attestationId: string;
  isPrimary: boolean;
  contentMode: string;
  similarityToPrimary: number | null;
  definition: { md: string; text: string };
  sourceLocator: PublicAttestation['sourceLocator'];
  extractorVersion: string | null;
  extractedAt: string | null;
};

function serializeAttestation(row: PublicAttestation): SerializedAttestation {
  return {
    ...serializeCitation(row.citation),
    attestationId: row.id,
    isPrimary: row.isPrimary,
    contentMode: row.contentMode,
    similarityToPrimary: row.similarityToPrimary,
    definition: { md: row.definitionMd, text: row.definitionText },
    sourceLocator: row.sourceLocator,
    extractorVersion: row.extractorVersion,
    extractedAt: iso(row.extractedAt),
  };
}

type SerializedSense = {
  id: string;
  slug: string | null;
  order: number;
  label: string | null;
  expandedForm: string | null;
  needsLabel: boolean;
  disambiguationNote: string | null;
  isPreferred: boolean;
  isEditorial: boolean;
  editorialRationale: string | null;
  definition: { md: string | null; text: string | null };
  url: string;
  citationRecordUrl: string;
  examples: Array<{ id: string; md: string | null; text: string | null }>;
  citations: SerializedAttestation[];
};

function serializeSense(
  sense: PublicApiSense,
  entry: { entryType: string; primarySlug: string },
): SerializedSense {
  return {
    id: sense.id,
    slug: sense.slug,
    order: sense.senseOrder,
    label: sense.senseLabel,
    expandedForm: sense.expandedForm,
    needsLabel: sense.needsLabel,
    disambiguationNote: sense.disambiguationNote,
    isPreferred: sense.isPreferred,
    isEditorial: sense.isEditorial,
    editorialRationale: sense.editorialRationale,
    definition: { md: sense.definitionMd, text: sense.definitionText },
    url: sensePath(entry.entryType, entry.primarySlug, sense.slug),
    citationRecordUrl: `/api/v1/senses/${sense.id}/citation.json`,
    examples: sense.examples.map((example) => ({
      id: example.id,
      md: example.exampleMd,
      text: example.exampleText,
    })),
    citations: sense.definitions.map(serializeAttestation),
  };
}

type SerializedEntry = {
  id: string;
  type: string;
  slug: string;
  title: string;
  url: string;
  summary: { md: string | null; text: string | null };
  publishedAt: string | null;
  updatedAt: string | null;
  variants: Array<{ text: string; type: string }>;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    kind: string;
    assignedBy: string;
  }>;
  senses: SerializedSense[];
  license: typeof LICENSE;
};

export function serializeEntry(entry: PublicApiEntry): SerializedEntry {
  return {
    id: entry.id,
    type: entry.entryType,
    slug: entry.primarySlug,
    title: entry.displayTitle,
    url: entryPath(entry.entryType, entry.primarySlug),
    summary: { md: entry.summaryMd, text: entry.summaryText },
    publishedAt: iso(entry.publishedAt),
    updatedAt: iso(entry.updatedAt),
    variants: entry.variants.map((variant) => ({
      text: variant.variantText,
      type: variant.variantType,
    })),
    tags: entry.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      kind: tag.kind,
      assignedBy: tag.assignedBy,
    })),
    senses: entry.senses.map((sense) => serializeSense(sense, entry)),
    license: LICENSE,
  };
}

type SerializedEntryListItem = {
  id: string;
  type: string;
  slug: string;
  title: string;
  url: string;
  summaryText: string | null;
  senseCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
  tags: Array<{ id: string; name: string; slug: string }>;
};

export function serializeEntryListItem(
  item: PublicApiEntryListItem,
): SerializedEntryListItem {
  return {
    id: item.id,
    type: item.entryType,
    slug: item.primarySlug,
    title: item.displayTitle,
    url: entryPath(item.entryType, item.primarySlug),
    summaryText: item.summaryText,
    senseCount: item.senseCount,
    publishedAt: iso(item.publishedAt),
    updatedAt: iso(item.updatedAt),
    tags: item.tags,
  };
}

export function serializeTag(tag: PublicApiTag) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    kind: tag.kind,
    parentId: tag.parentId,
    publishedCount: tag.publishedCount,
    url: `/tags/${tag.slug}`,
  };
}

export function serializeSource(source: PublicApiSource) {
  return {
    id: source.id,
    name: source.name,
    slug: source.sourceSlug,
    url: source.baseUrl,
    trustTier: source.trustTier,
    tierRationale: source.tierRationale,
    licenseType: source.licenseType,
    licenseUrl: source.licenseUrl,
    licenseStatement: source.licensePublicStatement,
    licenseNotes: source.licenseNotes,
    attributionHtml: source.attributionHtml,
    attributionRequirements: source.attributionRequirements,
    allowedUse: source.allowedUse,
    snapshotAllowed: source.snapshotAllowed,
    defaultContentMode: source.defaultContentMode,
    lastVerifiedAt: iso(source.lastVerifiedAt),
    updatedAt: iso(source.updatedAt),
    citedEntryCount: source.citedEntryCount,
    citationCount: source.citationCount,
    latestAccessedAt: iso(source.latestAccessedAt),
    pageUrl: `/sources/${source.sourceSlug}`,
  };
}

export function serializeSenseCitationRecord(
  record: PublicSenseCitationRecord,
) {
  return {
    entry: {
      id: record.entry.id,
      type: record.entry.entryType,
      slug: record.entry.primarySlug,
      title: record.entry.displayTitle,
      url: entryPath(record.entry.entryType, record.entry.primarySlug),
    },
    sense: {
      id: record.sense.id,
      slug: record.sense.slug,
      order: record.sense.senseOrder,
      label: record.sense.senseLabel,
      expandedForm: record.sense.expandedForm,
      needsLabel: record.sense.needsLabel,
      disambiguationNote: record.sense.disambiguationNote,
      definition: {
        md: record.sense.definitionMd,
        text: record.sense.definitionText,
      },
      url: sensePath(
        record.entry.entryType,
        record.entry.primarySlug,
        record.sense.slug,
      ),
    },
    attestations: record.attestations.map((row) => ({
      ...serializeCitation(row.citation),
      attestationId: row.id,
      isPrimary: row.isPrimary,
      contentMode: row.contentMode,
      similarityToPrimary: row.similarityToPrimary,
      definition: { md: row.definitionText, text: row.definitionText },
      extractorVersion: row.extractorVersion,
      extractedAt: iso(row.extractedAt),
      sourceLocator: row.sourceLocator,
    })),
    license: LICENSE,
  };
}

/** `page`/`pageSize`/`total` echoed on every paginated response. */
export function pageMeta(input: {
  page: number;
  pageSize: number;
  total: number;
}) {
  return {
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    pageCount: Math.max(
      1,
      Math.ceil(input.total / Math.max(1, input.pageSize)),
    ),
  };
}
