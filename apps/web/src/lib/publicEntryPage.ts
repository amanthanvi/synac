import { notFound, permanentRedirect } from 'next/navigation';

import { markdownToText } from '@synac/db';

import { getEntryPage, type EntryPageResult } from './publicData';

export type PublicEntryType = 'TERM' | 'ACRONYM';

type EntryPageOk = Extract<EntryPageResult, { kind: 'ok' }>['data'];

type PublicSenseDefinition =
  EntryPageOk['entry']['senses'][number]['definitions'][number];

export type PublicSenseCitation = PublicSenseDefinition['citation'];
export type PublicSenseProvenanceRow = EntryPageOk['provenance'][number];
export type PublicEntryRelation = EntryPageOk['relationships'][number];
export type PublicEntryTagLink = EntryPageOk['entry']['entryTags'][number];
type PublicEntryExample =
  EntryPageOk['entry']['senses'][number]['examples'][number];

export type ContentMode = 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';

/** One source's account of a sense (a `SenseDefinition` row). */
export type SenseAttestation = {
  id: string;
  definitionMd: string;
  definitionText: string;
  contentMode: ContentMode;
  isPrimary: boolean;
  similarityToPrimary: number | null;
  sourceLocator: PublicSenseDefinition['sourceLocator'];
  extractorVersion: string | null;
  extractedAt: string | null;
  citation: PublicSenseCitation;
};

export type SenseBibliographyEntry = {
  citation: PublicSenseCitation;
  contentMode: ContentMode;
};

export type PublicEntrySenseView = {
  id: string;
  slug: string | null;
  /** DOM id of the card. Always the uuid form, so `#sense-<uuid>` keeps working. */
  elementId: string;
  /** Extra anchor rendered inside the card when the sense has a slug. */
  slugAnchorId: string | null;
  /** Fragment links should point here: `#s-<slug>` when a slug exists. */
  fragment: string;
  senseOrder: number;
  label: string;
  needsLabel: boolean;
  disambiguationNote: string | null;
  expandedForm: string | null;
  definitionMd: string | null;
  definitionText: string | null;
  excerpt: string;
  examples: PublicEntryExample[];
  attestations: SenseAttestation[];
  bibliography: SenseBibliographyEntry[];
  provenance: PublicSenseProvenanceRow[];
};

export type PublicEntryTocItem = {
  id: string;
  fragment: string;
  label: string;
};

export type PublicEntryPageData = {
  entryType: PublicEntryType;
  entry: {
    id: string;
    displayTitle: string;
    primarySlug: string;
    summaryMd: string | null;
    summaryText: string | null;
    updatedAt: string;
    entryTags: PublicEntryTagLink[];
  };
  senses: PublicEntrySenseView[];
  /** False when the header summary would repeat the first sense's definition. */
  showHeaderSummary: boolean;
  relationsByType: Array<{
    type: string;
    title: string;
    items: PublicEntryRelation[];
  }>;
  otherSummaryById: Map<string, string | null>;
  tocItems: PublicEntryTocItem[];
  standsForPrimary: { primary: string | null; alternates: string[] };
  alsoKnownAs: string[];
  canonicalPath: string;
};

const RELATION_SECTIONS: Array<{ type: string; title: string }> = [
  { type: 'BROADER_THAN', title: 'Broader' },
  { type: 'NARROWER_THAN', title: 'Narrower' },
  { type: 'OFTEN_CONFUSED_WITH', title: 'Often confused with' },
  { type: 'RELATED', title: 'Related' },
  { type: 'SEE_ALSO', title: 'See also' },
];

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
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

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

function dedupeNormalizedStrings(raw: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of raw) {
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }
  return values;
}

function standsForPrimaryFromCandidates(
  candidates: string[],
  entry: { summaryText: string | null; summaryMd: string | null },
): { primary: string | null; alternates: string[] } {
  const first = candidates[0];
  if (!first) return { primary: null, alternates: [] };
  if (candidates.length === 1) return { primary: first, alternates: [] };

  const definition = (entry.summaryText ?? entry.summaryMd ?? '').trim();
  if (!definition) return { primary: first, alternates: candidates.slice(1) };

  const scored = candidates
    .map((value) => ({
      text: value,
      score: scoreByDefinition(value, definition),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.text.localeCompare(right.text),
    );

  const primary = scored[0]?.text ?? first;
  return {
    primary,
    alternates: candidates.filter(
      (value) => value.toLowerCase() !== primary.toLowerCase(),
    ),
  };
}

function contentModeRank(mode: ContentMode): number {
  if (mode === 'QUOTED') return 3;
  if (mode === 'PARAPHRASED') return 2;
  return 1;
}

/**
 * One bibliography row per (source, url), keeping the strongest content mode
 * seen for it across both attestations and field provenance.
 */
function buildBibliography(
  attestations: SenseAttestation[],
  provenance: PublicSenseProvenanceRow[],
): SenseBibliographyEntry[] {
  const byKey = new Map<string, SenseBibliographyEntry>();

  const add = (citation: PublicSenseCitation, contentMode: ContentMode) => {
    const key = `${citation.sourceId}:${normalizeRefUrl(citation.url)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { citation, contentMode });
      return;
    }
    if (contentModeRank(contentMode) > contentModeRank(existing.contentMode)) {
      existing.contentMode = contentMode;
    }
  };

  for (const attestation of attestations)
    add(attestation.citation, attestation.contentMode);
  for (const row of provenance) add(row.citation, row.contentMode);

  return Array.from(byKey.values());
}

/** 1.3: label, expansion, first attesting source, then a positional fallback. */
function senseLabel(
  sense: EntryPageOk['entry']['senses'][number],
  attestations: SenseAttestation[],
): string {
  const explicit = sense.senseLabel?.trim();
  if (explicit) return explicit;

  const expanded = sense.expandedForm?.trim();
  if (expanded) return expanded;

  const sourceName = attestations[0]?.citation.source.name.trim();
  if (sourceName) return sourceName;

  return `Sense ${sense.senseOrder + 1}`;
}

/** Rendered definition: the primary attestation, else the first, else legacy fields. */
function renderedDefinition(
  sense: EntryPageOk['entry']['senses'][number],
  attestations: SenseAttestation[],
): { definitionMd: string | null; definitionText: string | null } {
  const preferred =
    attestations.find((item) => item.isPrimary) ?? attestations[0];
  if (preferred) {
    return {
      definitionMd: preferred.definitionMd || null,
      definitionText: preferred.definitionText || null,
    };
  }

  return {
    definitionMd: sense.definitionMd,
    definitionText: sense.definitionText,
  };
}

function toPlainText(md: string | null, text: string | null): string {
  const raw = text ? text : md ? markdownToText(md) : '';
  return raw.replace(/\s+/g, ' ').trim();
}

export function entryPath(entryType: PublicEntryType, slug: string): string {
  return entryType === 'TERM' ? `/term/${slug}` : `/acronym/${slug}`;
}

/** Throws the redirect or 404 for a slug; returns the loaded page otherwise. */
async function resolveEntryRoute(input: {
  slug: string;
  requestedType: PublicEntryType;
}): Promise<Extract<Awaited<ReturnType<typeof getEntryPage>>, { kind: 'ok' }>> {
  const result = await getEntryPage(input.requestedType, input.slug);

  if (result.kind === 'redirect') {
    permanentRedirect(entryPath(result.entryType, result.slug));
  }

  if (result.kind === 'not-found') {
    notFound();
  }

  return result;
}

export async function loadPublicEntryPageData(input: {
  slug: string;
  requestedType: PublicEntryType;
}): Promise<PublicEntryPageData> {
  const result = await resolveEntryRoute(input);

  const {
    entry,
    provenance,
    relationships,
    otherSummaryById: otherSummaries,
  } = result.data;

  const provenanceBySenseId = new Map<string, PublicSenseProvenanceRow[]>();
  for (const row of provenance) {
    const list = provenanceBySenseId.get(row.entityId) ?? [];
    list.push(row);
    provenanceBySenseId.set(row.entityId, list);
  }

  const senses: PublicEntrySenseView[] = entry.senses.map((sense) => {
    const attestations: SenseAttestation[] = sense.definitions.map(
      (definition) => ({
        id: definition.id,
        definitionMd: definition.definitionMd,
        definitionText: definition.definitionText,
        contentMode: definition.contentMode,
        isPrimary: definition.isPrimary,
        similarityToPrimary: definition.similarityToPrimary,
        sourceLocator: definition.sourceLocator,
        extractorVersion: definition.extractorVersion,
        extractedAt: definition.extractedAt,
        citation: definition.citation,
      }),
    );

    const senseProvenance = provenanceBySenseId.get(sense.id) ?? [];
    const definition = renderedDefinition(sense, attestations);
    const excerpt = toPlainText(
      definition.definitionMd,
      definition.definitionText,
    );

    return {
      id: sense.id,
      slug: sense.slug,
      elementId: `sense-${sense.id}`,
      slugAnchorId: sense.slug ? `s-${sense.slug}` : null,
      fragment: sense.slug ? `#s-${sense.slug}` : `#sense-${sense.id}`,
      senseOrder: sense.senseOrder,
      label: senseLabel(sense, attestations),
      needsLabel: sense.needsLabel,
      disambiguationNote: sense.disambiguationNote,
      expandedForm: sense.expandedForm,
      definitionMd: definition.definitionMd,
      definitionText: definition.definitionText,
      excerpt: excerpt || 'No definition yet.',
      examples: sense.examples,
      attestations,
      bibliography: buildBibliography(attestations, senseProvenance),
      provenance: senseProvenance,
    };
  });

  const otherSummaryById = new Map<string, string | null>();
  for (const other of otherSummaries) {
    otherSummaryById.set(
      other.id,
      other.summaryText ??
        (other.summaryMd ? markdownToText(other.summaryMd) : null),
    );
  }

  const relationsByType = RELATION_SECTIONS.map((section) => ({
    ...section,
    items: relationships
      .filter((relation) => relation.relationshipType === section.type)
      .slice(0, 12),
  })).filter((section) => section.items.length > 0);

  const tocItems: PublicEntryTocItem[] = senses.map((sense) => ({
    id: sense.id,
    fragment: sense.fragment,
    label: sense.label,
  }));

  // 1.2: the header summary is dropped when it just repeats sense 1.
  const headerSummary = toPlainText(entry.summaryMd, entry.summaryText);
  const firstSenseText = senses[0]?.excerpt ?? '';
  const showHeaderSummary =
    headerSummary.length > 0 &&
    headerSummary.toLowerCase() !== firstSenseText.toLowerCase();

  const variants = dedupeNormalizedStrings(
    entry.variants.map((variant) => variant.variantText),
  );

  const base = {
    entryType: input.requestedType,
    entry: {
      id: entry.id,
      displayTitle: entry.displayTitle,
      primarySlug: entry.primarySlug,
      summaryMd: entry.summaryMd,
      summaryText: entry.summaryText,
      updatedAt: entry.updatedAt,
      entryTags: entry.entryTags,
    },
    senses,
    showHeaderSummary,
    relationsByType,
    otherSummaryById,
    tocItems,
    canonicalPath: entryPath(input.requestedType, entry.primarySlug),
  };

  if (input.requestedType === 'ACRONYM') {
    const expandedForms = dedupeNormalizedStrings([
      ...entry.senses
        .map((sense) => sense.expandedForm)
        .filter((value): value is string => Boolean(value?.trim())),
      ...variants.filter((value) => value.includes(' ')),
    ]);

    return {
      ...base,
      standsForPrimary: standsForPrimaryFromCandidates(expandedForms, entry),
      alsoKnownAs: variants.filter(
        (variant) =>
          !expandedForms.some(
            (expanded) => expanded.toLowerCase() === variant.toLowerCase(),
          ),
      ),
    };
  }

  const titleIsShortform = (() => {
    const value = entry.displayTitle.trim();
    if (!value || value.includes(' ')) return false;
    if (value.length < 2 || value.length > 12) return false;
    const letters = value.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2) return false;
    return letters.replace(/[^A-Z]/g, '').length >= 2;
  })();

  const standsFor = variants.filter((variant) => variant.includes(' '));

  return {
    ...base,
    standsForPrimary:
      titleIsShortform && standsFor.length > 0
        ? standsForPrimaryFromCandidates(standsFor, entry)
        : { primary: null, alternates: [] },
    alsoKnownAs:
      titleIsShortform && standsFor.length
        ? variants.filter((variant) => !variant.includes(' '))
        : variants,
  };
}
