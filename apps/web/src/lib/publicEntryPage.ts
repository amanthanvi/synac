import { senseAnchorId } from '@synac/shared';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  readEntryPage,
  readResolvedSlug,
  type EntryType,
  type PublicEntry,
  type PublicEntryRelation,
  type PublicEntrySense,
  type PublicSenseCitation,
} from './convex';
import { getSiteUrl } from './sitemap';

/**
 * The heading a sense is known by, everywhere it is named: the sense list, the
 * nav, the citation blocks and the JSON-LD. Never "Sense N": a sense without
 * an editorial label still carries the source label it was compiled from.
 */
export function senseHeadingText(
  sense: Pick<PublicEntrySense, 'label' | 'expandedForm' | 'labelFallback'>,
  entryType: EntryType,
): string {
  // An acronym's expansion names the meaning; a source marker like "(I)" does not.
  return entryType === 'ACRONYM'
    ? (sense.expandedForm ?? sense.label ?? sense.labelFallback)
    : (sense.label ?? sense.expandedForm ?? sense.labelFallback);
}

export function entryPath(entryType: EntryType, slug: string): string {
  return entryType === 'TERM' ? `/term/${slug}` : `/acronym/${slug}`;
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

export type StandsFor = { primary: string | null; alternates: string[] };

function standsForPrimaryFromCandidates(
  candidates: string[],
  entry: { summaryText: string | null },
): StandsFor {
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
    .map((value) => ({
      text: value,
      score: scoreByDefinition(value, definition),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.text.localeCompare(right.text),
    );
  const primary = scored[0]!.text;
  return {
    primary,
    alternates: candidates.filter(
      (value) => value.toLowerCase() !== primary.toLowerCase(),
    ),
  };
}

export type SenseNavItem = { id: string; label: string };

export type PublicEntryPageData = {
  entry: PublicEntry;
  related: PublicEntryRelation[];
  seeAlso: PublicEntryRelation[];
  compareWith: PublicEntryRelation[];
  navItems: SenseNavItem[];
  standsForPrimary: StandsFor;
  alsoKnownAs: string[];
  /** Absolute, so copied sense links and JSON-LD never depend on the browser. */
  canonicalUrl: string;
};

export async function loadPublicEntryPageData(input: {
  slug: string;
  requestedType: EntryType;
}): Promise<PublicEntryPageData> {
  const resolved = await readResolvedSlug(
    input.requestedType,
    input.slug.trim().toLowerCase(),
  );

  if (!resolved) notFound();

  if (resolved.entryType !== input.requestedType || resolved.needsRedirect) {
    permanentRedirect(entryPath(resolved.entryType, resolved.canonicalSlug));
  }

  const pageData = await readEntryPage(
    input.requestedType,
    resolved.canonicalSlug,
  );

  if (!pageData) notFound();

  const entry = pageData.entry;
  const byType = (type: PublicEntryRelation['type']) =>
    pageData.relationships.filter((rel) => rel.type === type).slice(0, 10);

  const navItems = entry.senses.map((sense) => ({
    id: senseAnchorId(sense.key),
    label: senseHeadingText(sense, entry.entryType),
  }));

  const canonicalUrl = `${getSiteUrl()}${entryPath(entry.entryType, entry.slug)}`;

  const aliases = dedupeNormalizedStrings(entry.aliases);

  const common = {
    entry,
    related: byType('RELATED'),
    seeAlso: byType('SEE_ALSO'),
    compareWith: byType('CONTRAST'),
    navItems,
    canonicalUrl,
  };

  if (input.requestedType === 'ACRONYM') {
    const expandedForms = dedupeNormalizedStrings([
      ...entry.senses.flatMap((sense) => {
        const expanded = sense.expandedForm?.trim();
        return expanded ? [expanded] : [];
      }),
      ...aliases.filter((value) => value.includes(' ')),
    ]);

    const standsForPrimary = standsForPrimaryFromCandidates(
      expandedForms,
      entry,
    );

    const alsoKnownAs = aliases.filter(
      (alias) =>
        !expandedForms.some(
          (expanded) => expanded.toLowerCase() === alias.toLowerCase(),
        ),
    );

    return { ...common, standsForPrimary, alsoKnownAs };
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
    titleIsShortform && standsFor.length
      ? aliases.filter((alias) => !alias.includes(' '))
      : aliases;

  const standsForPrimary: StandsFor =
    titleIsShortform && standsFor.length > 0
      ? standsForPrimaryFromCandidates(standsFor, entry)
      : { primary: null, alternates: [] };

  return { ...common, standsForPrimary, alsoKnownAs };
}

/** Citations deduplicated by source + URL; a sense often cites one document twice. */
export function dedupeSenseCitations(
  citations: PublicSenseCitation[],
): PublicSenseCitation[] {
  const byKey = new Map<string, PublicSenseCitation>();
  for (const citation of citations) {
    const key = `${citation.sourceSlug}:${citation.url.trim().replace(/\/+$/, '')}`;
    if (!byKey.has(key)) byKey.set(key, citation);
  }
  return [...byKey.values()];
}
