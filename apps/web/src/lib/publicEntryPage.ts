import { notFound, permanentRedirect } from 'next/navigation';

import { api, getConvexClient, type FunctionReturnType } from './convex';

type PublicEntryType = 'TERM' | 'ACRONYM';

type EntryPagePayload = NonNullable<FunctionReturnType<typeof api.publicEntries.getEntryPage>>;

export type PublicEntry = EntryPagePayload['entry'];
export type PublicEntrySense = PublicEntry['senses'][number];
export type PublicSenseCitation = PublicEntrySense['citations'][number];
export type PublicEntryRelation = EntryPagePayload['relationships'][number];

/** Anchor id for a sense, safe for URLs and CSS selectors. */
export function senseAnchorId(sense: Pick<PublicEntrySense, 'key'>): string {
  return `sense-${sense.key.replace(/[^a-zA-Z0-9-]+/g, '-')}`;
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
  entry: { summaryText: string | null },
): { primary: string | null; alternates: string[] } {
  if (candidates.length === 0) {
    return { primary: null, alternates: [] };
  }
  if (candidates.length === 1) {
    return { primary: candidates[0]!, alternates: [] };
  }
  const definition = (entry.summaryText ?? '').trim();
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
  entry: PublicEntry;
  related: PublicEntryRelation[];
  seeAlso: PublicEntryRelation[];
  tocItems: Array<{ id: string; label: string }>;
  standsForPrimary: { primary: string | null; alternates: string[] };
  alsoKnownAs: string[];
}> {
  const client = getConvexClient();
  const resolved = await client.query(api.publicEntries.resolveBySlug, {
    entryType: input.requestedType,
    slug: input.slug,
  });

  if (!resolved) notFound();

  if (resolved.entryType !== input.requestedType || resolved.needsRedirect) {
    permanentRedirect(
      resolved.entryType === 'TERM'
        ? `/term/${resolved.canonicalSlug}`
        : `/acronym/${resolved.canonicalSlug}`,
    );
  }

  const pageData = await client.query(api.publicEntries.getEntryPage, {
    entryType: input.requestedType,
    slug: resolved.canonicalSlug,
    relationshipLimit: 50,
  });

  if (!pageData) notFound();

  const entry = pageData.entry;
  const related = pageData.relationships.filter((rel) => rel.type === 'RELATED').slice(0, 10);
  const seeAlso = pageData.relationships.filter((rel) => rel.type === 'SEE_ALSO').slice(0, 10);

  const tocItems = entry.senses.map((sense) => ({
    id: senseAnchorId(sense),
    label: sense.label ?? `Sense ${sense.order + 1}`,
  }));

  const aliases = dedupeNormalizedStrings(entry.aliases);

  if (input.requestedType === 'ACRONYM') {
    const expandedForms = dedupeNormalizedStrings([
      ...entry.senses
        .map((sense) => sense.expandedForm)
        .filter((value): value is string => Boolean(value?.trim())),
      ...aliases.filter((value) => value.includes(' ')),
    ]);

    const standsForPrimary = standsForPrimaryFromCandidates(expandedForms, entry);

    const alsoKnownAs = aliases.filter(
      (alias) => !expandedForms.some((expanded) => expanded.toLowerCase() === alias.toLowerCase()),
    );

    return { entry, related, seeAlso, tocItems, standsForPrimary, alsoKnownAs };
  }

  const titleIsShortform = (() => {
    const value = entry.title.trim();
    if (!value || value.includes(' ')) return false;
    if (value.length < 2 || value.length > 12) return false;
    const letters = value.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2) return false;
    const uppercase = letters.replace(/[^A-Z]/g, '').length;
    return uppercase >= 2;
  })();

  const standsFor = aliases.filter((alias) => alias.includes(' '));
  const alsoKnownAs =
    titleIsShortform && standsFor.length ? aliases.filter((alias) => !alias.includes(' ')) : aliases;

  const standsForPrimary =
    titleIsShortform && standsFor.length > 0
      ? standsForPrimaryFromCandidates(standsFor, entry)
      : { primary: null, alternates: [] as string[] };

  return { entry, related, seeAlso, tocItems, standsForPrimary, alsoKnownAs };
}

/** Citations deduplicated by source + URL for the pill row. */
export function dedupeSenseCitations(citations: PublicSenseCitation[]): PublicSenseCitation[] {
  const byKey = new Map<string, PublicSenseCitation>();
  for (const citation of citations) {
    const key = `${citation.sourceSlug}:${citation.url.trim().replace(/\/+$/, '')}`;
    if (!byKey.has(key)) byKey.set(key, citation);
  }
  return [...byKey.values()];
}
