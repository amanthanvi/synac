import { notFound, permanentRedirect } from 'next/navigation';

import {
  getPrismaClient,
  listPublishedRelationshipsForEntry,
  queryPublicConvex,
  resolvePublishedEntryBySlug,
} from '@synac/db';

import { markdownToText } from './text';

type PublicEntryType = 'TERM' | 'ACRONYM';

export type PublicEntryExample = {
  id: string;
  exampleMd: string | null;
  exampleText: string | null;
};

export type PublicEntryTagLink = {
  tag: {
    id: string;
    name: string;
    slug: string;
  };
};

export type PublicEntrySense = {
  id: string;
  senseOrder: number;
  senseLabel: string | null;
  expandedForm: string | null;
  definitionMd: string | null;
  definitionText: string | null;
  examples: PublicEntryExample[];
};

export type PublicEntryRecord = {
  id: string;
  displayTitle: string;
  summaryMd: string | null;
  summaryText: string | null;
  updatedAt: Date;
  entryTags: PublicEntryTagLink[];
  variants: Array<{ variantText: string }>;
  senses: PublicEntrySense[];
};

export type PublicSenseCitation = {
  id: string;
  sourceId: string;
  url: string;
  source: { name: string };
  sourceDocument: { title: string | null };
  licenseNote: string | null;
  attributionText: string | null;
  accessedAt: Date;
};

export type PublicSenseProvenance = {
  entityId: string;
  contentMode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
  citation: PublicSenseCitation;
};

export type PublicEntryRelation = Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>[number];

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

function dedupeVariantTexts(variants: Array<{ variantText: string }>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const variant of variants) {
    const text = variant.variantText.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }
  return values;
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

type EntrySummaryForStand = { summaryText: string | null; summaryMd: string | null };

function standsForPrimaryFromCandidates(
  candidates: string[],
  entry: EntrySummaryForStand,
): { primary: string | null; alternates: string[] } {
  if (candidates.length === 0) {
    return { primary: null, alternates: [] };
  }
  if (candidates.length === 1) {
    return { primary: candidates[0]!, alternates: [] };
  }
  const definition = (entry.summaryText ?? entry.summaryMd ?? '').trim();
  if (!definition) {
    return { primary: candidates[0]!, alternates: candidates.slice(1) };
  }
  const scored = candidates
    .map((value) => ({ text: value, score: scoreByDefinition(value, definition) }))
    .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text));
  const primary = scored[0]!.text;
  return {
    primary,
    alternates: candidates.filter((value) => value.toLowerCase() !== primary.toLowerCase()),
  };
}

export function formatEntryDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export type PublicEntryPageData = Awaited<ReturnType<typeof loadPublicEntryPageData>>;

export async function loadPublicEntryPageData(input: {
  slug: string;
  requestedType: PublicEntryType;
}): Promise<{
  entry: NonNullable<PublicEntryRecord>;
  related: Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>;
  seeAlso: Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>;
  otherSummaryById: Map<string, string | null>;
  provenanceBySenseId: Map<string, PublicSenseProvenance[]>;
  tocItems: Array<{ id: string; label: string }>;
  standsForPrimary: { primary: string | null; alternates: string[] };
  alsoKnownAs: string[];
}> {
  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, {
    entryType: input.requestedType,
    slug: input.slug,
  });

  if (!resolved) {
    const fallbackType = input.requestedType === 'TERM' ? 'ACRONYM' : 'TERM';
    const fallback = await resolvePublishedEntryBySlug(prisma, {
      entryType: fallbackType,
      slug: input.slug,
    });

    if (fallback) {
      permanentRedirect(
        fallbackType === 'TERM'
          ? `/term/${fallback.canonicalSlug}`
          : `/acronym/${fallback.canonicalSlug}`,
      );
    }

    notFound();
  }

  if (resolved.entry.entryType !== input.requestedType) {
    permanentRedirect(
      resolved.entry.entryType === 'TERM'
        ? `/term/${resolved.canonicalSlug}`
        : `/acronym/${resolved.canonicalSlug}`,
    );
  }

  if (resolved.needsRedirect) {
    permanentRedirect(
      input.requestedType === 'TERM'
        ? `/term/${resolved.canonicalSlug}`
        : `/acronym/${resolved.canonicalSlug}`,
    );
  }

  const pageData = await queryPublicConvex<{
    entry: PublicEntryRecord;
    provenance: PublicSenseProvenance[];
    relationships: Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>;
    relatedSummaries: Array<{ id: string; summaryText: string | null; summaryMd: string | null }>;
  } | null>('getPublicEntryPage', { entryId: resolved.entry.id, relationshipLimit: 50 });

  if (!pageData) {
    notFound();
  }

  const entry = pageData.entry;
  const provenanceBySenseId = new Map<string, PublicSenseProvenance[]>();
  for (const item of pageData.provenance) {
    const list = provenanceBySenseId.get(item.entityId) ?? [];
    list.push(item);
    provenanceBySenseId.set(item.entityId, list);
  }

  const relationships = pageData.relationships;
  const related = relationships.filter((relationship) => relationship.relationshipType === 'RELATED').slice(0, 10);
  const seeAlso = relationships
    .filter((relationship) => relationship.relationshipType === 'SEE_ALSO')
    .slice(0, 10);

  const otherSummaryById = new Map<string, string | null>();
  for (const other of pageData.relatedSummaries) {
    otherSummaryById.set(
      other.id,
      other.summaryText ?? (other.summaryMd ? markdownToText(other.summaryMd) : null),
    );
  }

  const tocItems = entry.senses.map((sense) => ({
    id: sense.id,
    label: sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`,
  }));

  if (input.requestedType === 'ACRONYM') {
    const variants = dedupeVariantTexts(entry.variants);

    const expandedForms = dedupeNormalizedStrings([
      ...entry.senses
        .map((sense) => sense.expandedForm)
        .filter((value): value is string => Boolean(value?.trim())),
      ...variants.filter((value) => value.includes(' ')),
    ]);

    const standsForPrimary = standsForPrimaryFromCandidates(expandedForms, entry);

    const alsoKnownAs = variants.filter(
      (variant) => !expandedForms.some((expanded) => expanded.toLowerCase() === variant.toLowerCase()),
    );

    return {
      entry,
      related,
      seeAlso,
      otherSummaryById,
      provenanceBySenseId,
      tocItems,
      standsForPrimary,
      alsoKnownAs,
    };
  }

  const variants = dedupeVariantTexts(entry.variants);

  const titleIsShortform = (() => {
    const value = entry.displayTitle.trim();
    if (!value || value.includes(' ')) return false;
    if (value.length < 2 || value.length > 12) return false;
    const letters = value.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2) return false;
    const uppercase = letters.replace(/[^A-Z]/g, '').length;
    return uppercase >= 2;
  })();

  const standsFor = variants.filter((variant) => variant.includes(' '));
  const alsoKnownAs =
    titleIsShortform && standsFor.length
      ? variants.filter((variant) => !variant.includes(' '))
      : variants;

  const standsForPrimary =
    titleIsShortform && standsFor.length > 0
      ? standsForPrimaryFromCandidates(standsFor, entry)
      : { primary: null, alternates: [] as string[] };

  return {
    entry,
    related,
    seeAlso,
    otherSummaryById,
    provenanceBySenseId,
    tocItems,
    standsForPrimary,
    alsoKnownAs,
  };
}

export function buildSenseCitations(
  provenanceItems: PublicSenseProvenance[],
): Array<{
  citation: PublicSenseProvenance['citation'];
  contentMode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
}> {
  const rank = (mode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED') => {
    if (mode === 'QUOTED') return 3;
    if (mode === 'PARAPHRASED') return 2;
    return 1;
  };

  const byKey = new Map<
    string,
    {
      citation: (typeof provenanceItems)[number]['citation'];
      contentMode: (typeof provenanceItems)[number]['contentMode'];
    }
  >();

  for (const provenance of provenanceItems) {
    const key = `${provenance.citation.sourceId}:${normalizeRefUrl(provenance.citation.url)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        citation: provenance.citation,
        contentMode: provenance.contentMode,
      });
      continue;
    }

    if (rank(provenance.contentMode) > rank(existing.contentMode)) {
      existing.contentMode = provenance.contentMode;
    }
  }

  return Array.from(byKey.values());
}
