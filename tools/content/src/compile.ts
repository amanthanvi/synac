import { createHash } from 'node:crypto';

import {
  type BundleEntry,
  type BundleFile,
  type CompiledAttestation,
  type CompiledCitation,
  type CompiledDataset,
  type CompiledEntry,
  type CompiledEntryTag,
  type CompiledSense,
  type CompiledSource,
  type EntryType,
  type OverrideFile,
  type RedirectsFile,
  type RelationshipType,
  type SourceFile,
  type TagAssignmentsFile,
  type TagsFile,
} from './model.js';
import {
  classificationCorpusHash,
  classificationEntryHash,
  stableJsonHash,
  tagTaxonomyHash,
} from './tagging.js';
import {
  compactSearchDocument,
  definitionSimilarity,
  markdownToText,
  normalizeTitle,
  normalizeWhitespace,
} from './text.js';

/** Two definitions this alike are one meaning; the lower bound only warns. */
const ATTACH_SIMILARITY = 0.8;
const AMBIGUOUS_SIMILARITY = 0.5;
const MAX_MATCH_TERMS = 60;
const MAX_SNIPPET_CHARS = 300;
const EDITORIAL_LABEL_FALLBACK = 'Editorial';

export type ContentInput = {
  sources: SourceFile[];
  tags: TagsFile;
  tagAssignments?: TagAssignmentsFile;
  redirects: RedirectsFile;
  bundles: BundleFile[];
  /** Keyed by entry key ("TERM:zero-trust"), derived from the override file path. */
  overrides: Map<string, OverrideFile>;
};

/**
 * The ungrouped, pre-dedupe shape of every entry. Tag classification hashes
 * this view, so grouping senses for display never stales an assignment.
 */
export type ClassificationView = {
  entries: CompiledEntry[];
  senses: CompiledSense[];
};

export type CompileResult =
  | {
      ok: true;
      dataset: CompiledDataset;
      classification: ClassificationView;
      warnings: string[];
    }
  | { ok: false; errors: string[]; warnings: string[] };

export type CompileOptions = {
  /** Experiment-only escape hatch. Production check/sync must never set this. */
  allowUnreleasedTagging?: boolean;
};

export function entryKey(entryType: EntryType, slug: string): string {
  return `${entryType}:${slug}`;
}

function dateMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function trustRank(tier: SourceFile['trustTier']): number {
  return tier === 'TIER1' ? 0 : tier === 'TIER2' ? 1 : 2;
}

/** A source may contribute content only when its license terms are complete and it is enabled. */
function sourceLicenseErrors(source: SourceFile): string[] {
  const errors: string[] = [];
  if (!source.license.allowedUse.trim()) {
    errors.push(`source ${source.slug}: license.allowedUse must not be blank`);
  }
  if (!source.license.attributionRequirements.trim()) {
    errors.push(
      `source ${source.slug}: license.attributionRequirements must not be blank`,
    );
  }
  return errors;
}

type MergedEntry = {
  entryType: EntryType;
  slug: string;
  contributions: Array<{ source: SourceFile; entry: BundleEntry }>;
  override: OverrideFile | undefined;
};

type SenseGrouping = {
  senses: CompiledSense[];
  /** Pairs kept apart but too alike to tell one from the other unlabelled. */
  ambiguous: Array<{ keys: [string, string]; similarity: number }>;
};

/** A merged sense speaks for its source through its own citation. */
function attestationOf(sense: CompiledSense): CompiledAttestation[] {
  const citation = sense.citations[0];
  if (!citation) return [];
  return [
    {
      key: sense.key,
      sourceSlug: citation.sourceSlug,
      sourceName: citation.sourceName,
      definitionMd: sense.definitionMd,
      definitionText: sense.definitionText,
      citation,
    },
  ];
}

function dedupeCitations(citations: CompiledCitation[]): CompiledCitation[] {
  const seen = new Set<string>();
  const result: CompiledCitation[] = [];
  for (const citation of citations) {
    const identity = `${citation.sourceSlug}\0${citation.url}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(citation);
  }
  return result;
}

/**
 * Folds near-duplicate source definitions into one sense with an attestation
 * per source. The first sense of a group (trust order, or the explicit
 * groupSenses primary) supplies the rendered wording.
 */
function groupEntrySenses(
  key: string,
  senses: CompiledSense[],
  override: OverrideFile | undefined,
  errors: string[],
): SenseGrouping {
  const byKey = new Map(senses.map((sense) => [sense.key, sense]));
  const primaryOf = new Map<string, string>();
  for (const group of override?.groupSenses ?? []) {
    for (const memberKey of group) {
      const member = byKey.get(memberKey);
      if (!member) {
        errors.push(
          `override ${key}: groupSenses key ${memberKey} matches no sense`,
        );
      } else if (member.isEditorial) {
        errors.push(
          `override ${key}: groupSenses cannot merge editorial sense ${memberKey}`,
        );
      }
    }
    for (const memberKey of group.slice(1)) {
      if (memberKey === group[0]) continue;
      if (primaryOf.has(memberKey)) {
        errors.push(
          `override ${key}: sense ${memberKey} appears in more than one groupSenses list`,
        );
      }
      primaryOf.set(memberKey, group[0] ?? memberKey);
    }
  }
  const grouped = new Set((override?.groupSenses ?? []).flat());
  const split = new Set(override?.splitSenses ?? []);
  for (const splitKey of split) {
    if (!byKey.has(splitKey)) {
      errors.push(
        `override ${key}: splitSenses key ${splitKey} matches no sense`,
      );
    }
    if (grouped.has(splitKey)) {
      errors.push(
        `override ${key}: sense ${splitKey} is in both groupSenses and splitSenses`,
      );
    }
  }

  const ambiguous: SenseGrouping['ambiguous'] = [];
  const leaders: CompiledSense[] = [];
  // A reviewed group primary must stay a leader; attaching it elsewhere would
  // leave its members pointing at a sense that is never emitted.
  const explicitPrimaries = new Set(primaryOf.values());
  for (const sense of senses) {
    if (primaryOf.has(sense.key)) continue;
    if (sense.isEditorial || explicitPrimaries.has(sense.key)) {
      leaders.push(sense);
      continue;
    }
    let best: { leader: CompiledSense; similarity: number } | undefined;
    for (const leader of leaders) {
      if (leader.isEditorial) continue;
      const similarity = definitionSimilarity(
        leader.definitionText,
        sense.definitionText,
      );
      if (!best || similarity > best.similarity) best = { leader, similarity };
    }
    if (best && best.similarity >= ATTACH_SIMILARITY) {
      if (!split.has(sense.key) && !split.has(best.leader.key)) {
        primaryOf.set(sense.key, best.leader.key);
        continue;
      }
    } else if (best && best.similarity >= AMBIGUOUS_SIMILARITY) {
      ambiguous.push({
        keys: [best.leader.key, sense.key],
        similarity: best.similarity,
      });
    }
    leaders.push(sense);
  }

  const members = new Map<string, CompiledSense[]>();
  for (const sense of senses) {
    const primaryKey = primaryOf.get(sense.key);
    if (primaryKey === undefined) continue;
    members.set(primaryKey, [...(members.get(primaryKey) ?? []), sense]);
  }
  const compiled = leaders.map((leader, index) => {
    const attestations = (members.get(leader.key) ?? []).flatMap((sense) =>
      attestationOf(sense),
    );
    return {
      ...leader,
      order: index,
      isPreferred: index === 0,
      attestations,
      citations: dedupeCitations([
        ...leader.citations,
        ...attestations.map((attestation) => attestation.citation),
      ]),
    };
  });
  const compiledByKey = new Map(compiled.map((sense) => [sense.key, sense]));
  for (const { keys } of ambiguous) {
    const left = compiledByKey.get(keys[0]);
    const right = compiledByKey.get(keys[1]);
    if (!left || !right || left.label || right.label) continue;
    left.needsLabel = true;
    right.needsLabel = true;
  }
  return { senses: compiled, ambiguous };
}

export function compileContent(
  input: ContentInput,
  options: CompileOptions = {},
): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sourcesBySlug = new Map<string, SourceFile>();
  for (const source of input.sources) {
    if (sourcesBySlug.has(source.slug)) {
      errors.push(`duplicate source slug: ${source.slug}`);
      continue;
    }
    errors.push(...sourceLicenseErrors(source));
    sourcesBySlug.set(source.slug, source);
  }

  const tagSlugs = new Set<string>();
  const publishedTagSlugs = new Set<string>();
  const taxonomyVersion = Number(input.tags.taxonomyVersion ?? '1');
  for (const tag of input.tags.tags) {
    if (tagSlugs.has(tag.slug)) errors.push(`duplicate tag slug: ${tag.slug}`);
    tagSlugs.add(tag.slug);
    if ((tag.lifecycle ?? 'PUBLISHED') === 'PUBLISHED')
      publishedTagSlugs.add(tag.slug);
    for (const cooccurrence of tag.allowedCooccurrences ?? []) {
      if (cooccurrence === tag.slug)
        errors.push(`tag ${tag.slug}: cannot co-occur with itself`);
    }
  }
  const retiredTagSlugs = new Set<string>();
  for (const retired of input.tags.retiredTags ?? []) {
    if (tagSlugs.has(retired.slug) || retiredTagSlugs.has(retired.slug)) {
      errors.push(`duplicate active or retired tag slug: ${retired.slug}`);
    }
    retiredTagSlugs.add(retired.slug);
    if (retired.replacedBy && !tagSlugs.has(retired.replacedBy)) {
      errors.push(
        `retired tag ${retired.slug}: replacement ${retired.replacedBy} is not active`,
      );
    } else if (
      retired.replacedBy &&
      !publishedTagSlugs.has(retired.replacedBy)
    ) {
      errors.push(
        `retired tag ${retired.slug}: replacement ${retired.replacedBy} is not published`,
      );
    }
  }

  if (
    taxonomyVersion >= 2 &&
    publishedTagSlugs.size > 0 &&
    !input.tagAssignments &&
    !options.allowUnreleasedTagging
  ) {
    errors.push(
      'taxonomy v2: published tags require content/tag-assignments.json',
    );
  }
  for (const tag of input.tags.tags) {
    for (const cooccurrence of tag.allowedCooccurrences ?? []) {
      if (!tagSlugs.has(cooccurrence)) {
        errors.push(
          `tag ${tag.slug}: allowedCooccurrences references unknown tag ${cooccurrence}`,
        );
      }
    }
  }

  const assignmentsByEntry = new Map<
    string,
    TagAssignmentsFile['assignments']
  >();
  const seenAssignmentPairs = new Set<string>();
  const assignmentEntriesApplied = new Set<string>();
  if (input.tagAssignments) {
    const taxonomyVersionText = input.tags.taxonomyVersion ?? '1';
    if (input.tagAssignments.taxonomyVersion !== taxonomyVersionText) {
      errors.push(
        `tag assignments: taxonomy version ${input.tagAssignments.taxonomyVersion} does not match ${taxonomyVersionText}`,
      );
    }
    const actualTaxonomyHash = tagTaxonomyHash(input.tags);
    if (input.tagAssignments.taxonomyHash !== actualTaxonomyHash) {
      errors.push(
        `tag assignments: taxonomy hash ${input.tagAssignments.taxonomyHash} does not match ${actualTaxonomyHash}`,
      );
    }
    const actualThresholdsHash = stableJsonHash(
      input.tagAssignments.run.thresholds,
    );
    if (input.tagAssignments.run.thresholdsHash !== actualThresholdsHash) {
      errors.push(
        `tag assignments: thresholds hash ${input.tagAssignments.run.thresholdsHash} does not match ${actualThresholdsHash}`,
      );
    }
    for (const tagSlug of publishedTagSlugs) {
      const threshold = input.tagAssignments.run.thresholds[tagSlug];
      if (threshold === undefined) {
        errors.push(
          `tag assignments: missing AUTO threshold for published tag ${tagSlug}`,
        );
      } else if (threshold < 0.98) {
        errors.push(
          `tag assignments: AUTO threshold for published tag ${tagSlug} is below 0.98`,
        );
      }
    }
    for (const tagSlug of Object.keys(input.tagAssignments.run.thresholds)) {
      if (!publishedTagSlugs.has(tagSlug)) {
        errors.push(
          `tag assignments: AUTO threshold references non-published tag ${tagSlug}`,
        );
      }
    }
    for (const assignment of input.tagAssignments.assignments) {
      const pair = `${assignment.entryKey}\0${assignment.tagSlug}`;
      if (seenAssignmentPairs.has(pair)) {
        errors.push(
          `tag assignments: duplicate ${assignment.entryKey} -> ${assignment.tagSlug}`,
        );
        continue;
      }
      seenAssignmentPairs.add(pair);
      if (!publishedTagSlugs.has(assignment.tagSlug)) {
        errors.push(
          `tag assignments: ${assignment.entryKey} references non-published tag ${assignment.tagSlug}`,
        );
      }
      if (assignment.runId !== input.tagAssignments.run.runId) {
        errors.push(
          `tag assignments: ${assignment.entryKey} -> ${assignment.tagSlug} has a foreign run ID`,
        );
      }
      const threshold = input.tagAssignments.run.thresholds[assignment.tagSlug];
      if (threshold !== undefined && assignment.score < threshold) {
        errors.push(
          `tag assignments: ${assignment.entryKey} -> ${assignment.tagSlug} score ${assignment.score} is below AUTO threshold ${threshold}`,
        );
      }
      const rows = assignmentsByEntry.get(assignment.entryKey) ?? [];
      rows.push(assignment);
      assignmentsByEntry.set(assignment.entryKey, rows);
    }
    const seenRemovals = new Set<string>();
    for (const removal of input.tagAssignments.removals) {
      const pair = `${removal.entryKey}\0${removal.tagSlug}`;
      if (seenRemovals.has(pair))
        errors.push(
          `tag assignments: duplicate removal ${removal.entryKey} -> ${removal.tagSlug}`,
        );
      seenRemovals.add(pair);
      if (seenAssignmentPairs.has(pair)) {
        errors.push(
          `tag assignments: ${removal.entryKey} -> ${removal.tagSlug} is both assigned and removed`,
        );
      }
      if (removal.runId !== input.tagAssignments.run.runId) {
        errors.push(
          `tag assignments: removal ${removal.entryKey} -> ${removal.tagSlug} has a foreign run ID`,
        );
      }
      if (
        !tagSlugs.has(removal.tagSlug) &&
        !retiredTagSlugs.has(removal.tagSlug)
      ) {
        errors.push(
          `tag assignments: removal ${removal.entryKey} references unknown tag ${removal.tagSlug}`,
        );
      }
    }
    if (
      input.tagAssignments.removals.length > 0 &&
      !input.tagAssignments.run.previousAssignmentsHash
    ) {
      errors.push('tag assignments: removals require previousAssignmentsHash');
    }
  }

  // Collect bundle contributions per entry key, skipping disabled sources.
  const merged = new Map<string, MergedEntry>();
  for (const bundle of input.bundles) {
    const source = sourcesBySlug.get(bundle.source);
    if (!source) {
      errors.push(
        `bundle ${bundle.source}: no matching file in content/sources/`,
      );
      continue;
    }
    if (!source.enabled) {
      warnings.push(
        `bundle ${bundle.source}: source is disabled; skipping its content`,
      );
      continue;
    }
    const mode = source.license.contentMode;
    if (mode !== 'QUOTED' && bundle.entries.some((e) => e.senses.length > 0)) {
      // Adapters copy source wording; summaries and paraphrases are written by hand.
      errors.push(
        `bundle ${bundle.source}: source declares contentMode ${mode} but bundle senses carry source wording; write ${mode.toLowerCase()} senses in content/overrides/ instead`,
      );
      continue;
    }
    const documentKeys = new Set(bundle.documents.map((doc) => doc.key));
    const seenInBundle = new Set<string>();
    for (const entry of bundle.entries) {
      const key = entryKey(entry.entryType, entry.slug);
      if (seenInBundle.has(key)) {
        errors.push(`bundle ${bundle.source}: duplicate entry ${key}`);
        continue;
      }
      seenInBundle.add(key);
      const senseKeys = new Set<string>();
      for (const sense of entry.senses) {
        if (senseKeys.has(sense.key)) {
          errors.push(
            `bundle ${bundle.source}: entry ${key} has duplicate sense key ${sense.key}`,
          );
        }
        senseKeys.add(sense.key);
        if (!documentKeys.has(sense.citation.documentKey)) {
          errors.push(
            `bundle ${bundle.source}: entry ${key} sense ${sense.key} cites unknown document ${sense.citation.documentKey}`,
          );
        }
      }
      for (const tag of entry.tags) {
        if (taxonomyVersion >= 2 && entry.tags.length > 0) {
          errors.push(
            `bundle ${bundle.source}: entry ${key} cannot supply taxonomy-v2 tags`,
          );
          break;
        }
        if (!tagSlugs.has(tag)) {
          errors.push(
            `bundle ${bundle.source}: entry ${key} references unknown tag ${tag}`,
          );
        } else if (!publishedTagSlugs.has(tag)) {
          errors.push(
            `bundle ${bundle.source}: entry ${key} references non-published tag ${tag}`,
          );
        }
      }
      const existing = merged.get(key);
      if (existing) existing.contributions.push({ source, entry });
      else
        merged.set(key, {
          entryType: entry.entryType,
          slug: entry.slug,
          contributions: [{ source, entry }],
          override: undefined,
        });
    }
  }

  // Attach overrides; editorial-only overrides create entries.
  for (const [key, override] of input.overrides) {
    const [entryType, slug] = key.split(':') as [EntryType, string];
    const existing = merged.get(key);
    if (existing) {
      existing.override = override;
      continue;
    }
    if (
      override.editorialSenses.length > 0 &&
      override.title &&
      override.updatedAt
    ) {
      merged.set(key, { entryType, slug, contributions: [], override });
    } else if (override.suppress) {
      warnings.push(
        `override ${key}: suppresses an entry that no bundle defines`,
      );
    } else {
      errors.push(
        `override ${key}: matches no bundle entry; editorial-only entries need title, updatedAt, and at least one editorial sense`,
      );
    }
  }

  // Build compiled entries. The classification views below are the ungrouped,
  // pre-dedupe shape of each entry: grouping near-duplicate senses or dropping
  // a summary that repeats the first sense is presentation, so it must not
  // stale accepted tag assignments.
  const entries: CompiledEntry[] = [];
  const senses: CompiledSense[] = [];
  const classificationEntries: CompiledEntry[] = [];
  const classificationSenses: CompiledSense[] = [];
  const suppressedKeys = new Set<string>();

  const orderedMerged = [...merged.values()].sort((a, b) =>
    entryKey(a.entryType, a.slug).localeCompare(entryKey(b.entryType, b.slug)),
  );

  for (const item of orderedMerged) {
    const key = entryKey(item.entryType, item.slug);
    const override = item.override;
    if (override?.suppress) {
      suppressedKeys.add(key);
      continue;
    }

    const contributions = [...item.contributions].sort(
      (a, b) =>
        trustRank(a.source.trustTier) - trustRank(b.source.trustTier) ||
        a.source.slug.localeCompare(b.source.slug),
    );

    // Senses: bundle senses in source-precedence order, then editorial senses.
    const ungroupedSenses: CompiledSense[] = [];
    const suppressSenses = new Set(override?.suppressSenses ?? []);
    const usedSuppressions = new Set<string>();
    for (const { source, entry } of contributions) {
      const bundle = input.bundles.find((b) => b.source === source.slug);
      const documents = new Map(
        (bundle?.documents ?? []).map((doc) => [doc.key, doc]),
      );
      for (const sense of entry.senses) {
        const namespacedKey = `${source.slug}:${sense.key}`;
        if (suppressSenses.has(namespacedKey)) {
          usedSuppressions.add(namespacedKey);
          continue;
        }
        const document = documents.get(sense.citation.documentKey);
        const definitionText = markdownToText(sense.definitionMd);
        const citations: CompiledCitation[] = document
          ? [
              {
                sourceSlug: source.slug,
                sourceName: source.name,
                url: document.url,
                documentTitle: document.title,
                citationText: sense.citation.citationText,
                licenseNote: source.license.notes,
                licenseUrl: source.license.url,
                publicStatement: source.license.publicStatement,
                contentMode: source.license.contentMode,
                documentSha256: document.contentSha256,
                attributionText: source.license.attributionRequirements,
                accessedAt: Date.parse(document.fetchedAt),
                locator: sense.citation.locator,
              },
            ]
          : [];
        ungroupedSenses.push({
          entryKey: key,
          key: namespacedKey,
          order: ungroupedSenses.length,
          label: sense.label,
          labelFallback: source.name,
          disambiguationNote: undefined,
          needsLabel: false,
          normalizedLabel: '',
          definitionMd: sense.definitionMd,
          definitionText,
          expandedForm: sense.expandedForm,
          isEditorial: false,
          editorialRationale: undefined,
          isPreferred: false,
          examples: sense.examples.map((md) => ({
            md,
            text: markdownToText(md),
          })),
          attestations: [],
          citations,
        });
      }
    }
    for (const [index, sense] of (override?.editorialSenses ?? []).entries()) {
      ungroupedSenses.push({
        entryKey: key,
        key: `editorial:${index}`,
        order: ungroupedSenses.length,
        label: sense.label,
        labelFallback: EDITORIAL_LABEL_FALLBACK,
        disambiguationNote: undefined,
        needsLabel: false,
        normalizedLabel: '',
        definitionMd: sense.definitionMd,
        definitionText: markdownToText(sense.definitionMd),
        expandedForm: sense.expandedForm,
        isEditorial: true,
        editorialRationale: sense.rationale,
        isPreferred: false,
        examples: sense.examples.map((md) => ({
          md,
          text: markdownToText(md),
        })),
        attestations: [],
        citations: [],
      });
    }
    for (const suppressed of suppressSenses) {
      if (!usedSuppressions.has(suppressed)) {
        warnings.push(
          `override ${key}: suppressSenses entry ${suppressed} matches no sense`,
        );
      }
    }
    if (ungroupedSenses.length === 0) {
      errors.push(
        `entry ${key}: all senses suppressed; suppress the entry instead`,
      );
      continue;
    }

    if (override?.preferredSense) {
      const preferredIndex = ungroupedSenses.findIndex(
        (sense) => sense.key === override.preferredSense,
      );
      if (preferredIndex < 0) {
        errors.push(
          `override ${key}: preferredSense ${override.preferredSense} matches no sense`,
        );
      } else if (preferredIndex > 0) {
        // preferredIndex came from findIndex over this array, so the splice
        // always removes exactly one sense.
        const [preferred] = ungroupedSenses.splice(preferredIndex, 1);
        if (preferred) ungroupedSenses.unshift(preferred);
      }
    }
    ungroupedSenses.forEach((sense, index) => {
      sense.order = index;
      sense.isPreferred = index === 0;
    });

    const grouping = groupEntrySenses(key, ungroupedSenses, override, errors);
    const entrySenses = grouping.senses;
    const sensesByKey = new Map(
      entrySenses.map((sense) => [sense.key, sense] as const),
    );
    for (const [senseKey, label] of Object.entries(
      override?.labelSenses ?? {},
    )) {
      const sense = sensesByKey.get(senseKey);
      if (!sense) {
        errors.push(
          `override ${key}: labelSenses key ${senseKey} matches no sense`,
        );
        continue;
      }
      sense.label = label;
      sense.needsLabel = false;
    }
    for (const [senseKey, note] of Object.entries(
      override?.disambiguationNotes ?? {},
    )) {
      const sense = sensesByKey.get(senseKey);
      if (!sense) {
        errors.push(
          `override ${key}: disambiguationNotes key ${senseKey} matches no sense`,
        );
        continue;
      }
      sense.disambiguationNote = note;
    }

    const primary = contributions[0]?.entry;
    const title = override?.title ?? primary?.title;
    if (!title) {
      errors.push(`entry ${key}: no title available`);
      continue;
    }

    const aliasSeen = new Set<string>();
    const aliases: string[] = [];
    for (const alias of [
      ...contributions.flatMap((c) => c.entry.aliases),
      ...(override?.addAliases ?? []),
    ]) {
      const normalized = normalizeTitle(alias);
      if (
        !normalized ||
        normalized === normalizeTitle(title) ||
        aliasSeen.has(normalized)
      )
        continue;
      aliasSeen.add(normalized);
      aliases.push(alias);
    }

    for (const sense of entrySenses) {
      sense.normalizedLabel = normalizeTitle(
        sense.label ?? sense.expandedForm ?? title,
      );
    }
    const needsLabel = entrySenses.filter((sense) => sense.needsLabel);
    if (needsLabel.length > 0) {
      const flagged = new Set(needsLabel.map((sense) => sense.key));
      const similarity = Math.max(
        ...grouping.ambiguous
          .filter(({ keys }) => flagged.has(keys[0]) && flagged.has(keys[1]))
          .map(({ similarity: value }) => value),
      );
      warnings.push(
        `entry ${key}: senses ${needsLabel.map((sense) => sense.key).join(', ')} ` +
          `need labels (similarity ${similarity.toFixed(2)}); add labelSenses in ` +
          `content/overrides/${item.entryType.toLowerCase()}/${item.slug}.json`,
      );
    }

    const tags = new Map<string, CompiledEntryTag>();
    for (const tag of contributions.flatMap((c) => c.entry.tags)) {
      tags.set(tag, { slug: tag, assignedBy: 'EDITORIAL', score: undefined });
    }

    const summaryMd =
      override?.summaryMd ??
      contributions.find((c) => c.entry.summaryMd)?.entry.summaryMd;
    const summaryText = summaryMd ? markdownToText(summaryMd) : undefined;
    // The UI renders the first sense right below the title, so a derived
    // summary that repeats it would print the same sentence twice.
    const summaryRepeatsFirstSense =
      !override?.summaryMd &&
      summaryText !== undefined &&
      normalizeWhitespace(summaryText) ===
        normalizeWhitespace(entrySenses[0]?.definitionText ?? '');
    const publicSummaryMd = summaryRepeatsFirstSense ? undefined : summaryMd;
    const publicSummaryText = summaryRepeatsFirstSense
      ? undefined
      : summaryText;
    const updatedAt = Math.max(
      ...contributions.map((c) => dateMs(c.entry.updatedAt)),
      override?.updatedAt ? dateMs(override.updatedAt) : 0,
    );
    const citedSourceSlugs = [
      ...new Set(
        entrySenses.flatMap((s) => s.citations.map((c) => c.sourceSlug)),
      ),
    ].sort();

    // Browse and search show a compact list of the meanings an entry carries.
    const senseSummary =
      entrySenses.length > 1
        ? entrySenses
            .slice(0, 3)
            .map((sense) =>
              (sense.label ?? sense.expandedForm ?? sense.labelFallback).trim(),
            )
            .filter(Boolean)
            .join(' · ') || undefined
        : undefined;
    const matchTerms = [
      ...new Set(
        [
          ...aliases,
          ...entrySenses.flatMap((sense) => [sense.expandedForm, sense.label]),
        ]
          .map((value) => (value ? normalizeTitle(value) : ''))
          .filter(Boolean),
      ),
    ].slice(0, MAX_MATCH_TERMS);
    const compiled: CompiledEntry = {
      key,
      entryType: item.entryType,
      slug: item.slug,
      title,
      normalizedTitle: normalizeTitle(title),
      aliases,
      summaryMd: publicSummaryMd,
      summaryText: publicSummaryText,
      snippetText: (
        publicSummaryText ??
        entrySenses[0]?.definitionText ??
        ''
      ).slice(0, MAX_SNIPPET_CHARS),
      matchTerms,
      editorialNotes: override?.editorialNotes,
      updatedAt,
      senseCount: entrySenses.length,
      senseSummary,
      searchDocument: compactSearchDocument([
        title,
        normalizeTitle(title),
        item.slug,
        publicSummaryText,
        ...entrySenses.flatMap((sense) => [
          sense.label,
          sense.expandedForm,
          sense.definitionText,
          ...sense.attestations.map(
            (attestation) => attestation.definitionText,
          ),
        ]),
        ...aliases,
      ]),
      tags: [],
      tagSlugs: [],
      citedSourceSlugs,
    };
    const entryAssignments = assignmentsByEntry.get(key) ?? [];
    if (entryAssignments.length > 0) assignmentEntriesApplied.add(key);
    const classificationEntry: CompiledEntry = summaryRepeatsFirstSense
      ? { ...compiled, summaryMd, summaryText }
      : compiled;
    const actualEntryContentHash = classificationEntryHash(
      classificationEntry,
      ungroupedSenses,
    );
    for (const assignment of entryAssignments) {
      if (assignment.entryContentHash !== actualEntryContentHash) {
        errors.push(
          `tag assignments: ${key} -> ${assignment.tagSlug} is stale (${assignment.entryContentHash} != ${actualEntryContentHash})`,
        );
        continue;
      }
      if (!tags.has(assignment.tagSlug)) {
        tags.set(assignment.tagSlug, {
          slug: assignment.tagSlug,
          assignedBy: 'AUTO',
          score: assignment.score,
        });
      }
    }
    for (const tag of override?.addTags ?? []) {
      if (!publishedTagSlugs.has(tag)) {
        errors.push(
          `override ${key}: addTags references non-published tag ${tag}`,
        );
        continue;
      }
      tags.set(tag, { slug: tag, assignedBy: 'EDITORIAL', score: undefined });
    }
    for (const tag of override?.removeTags ?? []) {
      if (!publishedTagSlugs.has(tag)) {
        errors.push(
          `override ${key}: removeTags references non-published tag ${tag}`,
        );
        continue;
      }
      tags.delete(tag);
    }
    compiled.tags = [...tags.values()].sort((a, b) =>
      a.slug.localeCompare(b.slug),
    );
    compiled.tagSlugs = compiled.tags.map((tag) => tag.slug);
    entries.push(compiled);
    senses.push(...entrySenses);
    classificationEntries.push(classificationEntry);
    classificationSenses.push(...ungroupedSenses);
  }

  for (const entryKeyWithAssignments of assignmentsByEntry.keys()) {
    if (!assignmentEntriesApplied.has(entryKeyWithAssignments)) {
      errors.push(
        `tag assignments: references unknown or suppressed entry ${entryKeyWithAssignments}`,
      );
    }
  }
  if (input.tagAssignments) {
    const actualCorpusHash = classificationCorpusHash(
      classificationEntries,
      classificationSenses,
    );
    if (input.tagAssignments.run.corpusHash !== actualCorpusHash) {
      errors.push(
        `tag assignments: corpus hash ${input.tagAssignments.run.corpusHash} does not match ${actualCorpusHash}`,
      );
    }
  }

  // Relationships: union of bundle + override relationships, both endpoints must exist.
  const entryKeys = new Set(entries.map((entry) => entry.key));
  if (taxonomyVersion >= 2) {
    const exampleExists = (example: string): boolean =>
      /^(TERM|ACRONYM):/.test(example)
        ? entryKeys.has(example)
        : entryKeys.has(`TERM:${example}`) ||
          entryKeys.has(`ACRONYM:${example}`);
    for (const tag of input.tags.tags) {
      for (const example of tag.positiveExamples ?? []) {
        if (!exampleExists(example))
          errors.push(
            `tag ${tag.slug}: positive example ${example} is not a live entry`,
          );
      }
      for (const example of tag.hardNegatives ?? []) {
        if (!exampleExists(example))
          errors.push(
            `tag ${tag.slug}: hard negative ${example} is not a live entry`,
          );
      }
    }
  }
  const relationships = new Map<
    string,
    { fromKey: string; toKey: string; type: RelationshipType }
  >();
  for (const item of orderedMerged) {
    const fromKey = entryKey(item.entryType, item.slug);
    if (!entryKeys.has(fromKey)) continue;
    const declared = [
      ...item.contributions.flatMap((c) =>
        c.entry.relationships.map((rel) => ({
          rel,
          origin: `bundle ${c.source.slug}`,
        })),
      ),
      ...(item.override?.addRelationships ?? []).map((rel) => ({
        rel,
        origin: 'override',
      })),
    ];
    for (const { rel, origin } of declared) {
      const toKey = entryKey(rel.toType, rel.toSlug);
      if (toKey === fromKey) {
        errors.push(
          `${origin}: entry ${fromKey} declares a relationship to itself`,
        );
        continue;
      }
      if (suppressedKeys.has(toKey)) {
        warnings.push(
          `entry ${fromKey}: dropping relationship to suppressed entry ${toKey}`,
        );
        continue;
      }
      if (!entryKeys.has(toKey)) {
        errors.push(
          `${origin}: entry ${fromKey} relates to unknown entry ${toKey}`,
        );
        continue;
      }
      relationships.set(`${fromKey}->${toKey}:${rel.type}`, {
        fromKey,
        toKey,
        type: rel.type,
      });
    }
  }

  // Redirects must point at live entries and must not shadow one.
  for (const redirect of input.redirects.redirects) {
    const from = entryKey(redirect.entryType, redirect.fromSlug);
    const to = entryKey(redirect.entryType, redirect.toSlug);
    if (!entryKeys.has(to))
      errors.push(`redirect ${from} -> ${to}: target does not exist`);
    if (entryKeys.has(from))
      errors.push(`redirect ${from} -> ${to}: source slug is a live entry`);
  }

  const usedTags = new Set(entries.flatMap((entry) => entry.tagSlugs));
  for (const tag of input.tags.tags.filter(
    (candidate) => (candidate.lifecycle ?? 'PUBLISHED') === 'PUBLISHED',
  )) {
    if (!usedTags.has(tag.slug))
      warnings.push(`tag ${tag.slug}: not used by any entry`);
  }

  if (errors.length > 0)
    return { ok: false, errors: [...new Set(errors)].sort(), warnings };

  const citedEntryCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const sourceSlug of entry.citedSourceSlugs) {
      citedEntryCounts.set(
        sourceSlug,
        (citedEntryCounts.get(sourceSlug) ?? 0) + 1,
      );
    }
  }
  const tagEntryCounts = new Map<string, number>();
  const tagEditorialCounts = new Map<string, number>();
  const tagAutoCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      tagEntryCounts.set(tag.slug, (tagEntryCounts.get(tag.slug) ?? 0) + 1);
      const lane =
        tag.assignedBy === 'EDITORIAL' ? tagEditorialCounts : tagAutoCounts;
      lane.set(tag.slug, (lane.get(tag.slug) ?? 0) + 1);
    }
  }

  if (
    taxonomyVersion >= 2 &&
    publishedTagSlugs.size > 0 &&
    !options.allowUnreleasedTagging
  ) {
    const taggedEntryCount = entries.filter(
      (entry) => entry.tagSlugs.length > 0,
    ).length;
    const coverage =
      entries.length === 0 ? 0 : taggedEntryCount / entries.length;
    if (coverage < 0.3) {
      errors.push(
        `tag assignment release: entry coverage ${(coverage * 100).toFixed(2)}% is below the required 30.00%`,
      );
    }
    for (const tagSlug of publishedTagSlugs) {
      const count = tagEntryCounts.get(tagSlug) ?? 0;
      if (count < 25) {
        errors.push(
          `tag assignment release: published tag ${tagSlug} has ${count} entries; at least 25 required`,
        );
      }
      if (count > 5_000) {
        errors.push(
          `tag assignment release: published tag ${tagSlug} has ${count} entries; UI supports at most 5000`,
        );
      }
    }
  }

  if (errors.length > 0)
    return { ok: false, errors: [...new Set(errors)].sort(), warnings };

  const compiledSources: CompiledSource[] = [...sourcesBySlug.values()]
    .map((source) => ({
      slug: source.slug,
      name: source.name,
      baseUrl: source.baseUrl,
      licenseType: source.license.type,
      licenseUrl: source.license.url,
      licenseNotes: source.license.notes,
      publicStatement: source.license.publicStatement,
      contentMode: source.license.contentMode,
      allowedUse: source.license.allowedUse,
      attributionRequirements: source.license.attributionRequirements,
      trustTier: source.trustTier,
      enabled: source.enabled,
      lastVerifiedAt: dateMs(source.lastVerifiedAt),
      citedEntryCount: citedEntryCounts.get(source.slug) ?? 0,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const dataset: CompiledDataset = {
    contentVersion: '',
    sources: compiledSources,
    tags: [...input.tags.tags]
      .filter((tag) => (tag.lifecycle ?? 'PUBLISHED') === 'PUBLISHED')
      .map((tag) => ({
        slug: tag.slug,
        name: tag.name,
        description: tag.description,
        entryCount: tagEntryCounts.get(tag.slug) ?? 0,
        editorialCount: tagEditorialCounts.get(tag.slug) ?? 0,
        autoCount: tagAutoCounts.get(tag.slug) ?? 0,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
    entries,
    senses,
    relationships: [...relationships.values()].sort(
      (a, b) =>
        a.fromKey.localeCompare(b.fromKey) ||
        a.toKey.localeCompare(b.toKey) ||
        a.type.localeCompare(b.type),
    ),
    redirects: [...input.redirects.redirects].sort(
      (a, b) =>
        a.entryType.localeCompare(b.entryType) ||
        a.fromSlug.localeCompare(b.fromSlug),
    ),
    tagRedirects: (input.tags.retiredTags ?? [])
      .map((retired) => ({
        fromSlug: retired.slug,
        toSlug: retired.replacedBy,
      }))
      .sort((a, b) => a.fromSlug.localeCompare(b.fromSlug)),
  };
  dataset.contentVersion = createHash('sha256')
    .update(
      JSON.stringify({
        dataset: { ...dataset, contentVersion: undefined },
        taxonomyHash: tagTaxonomyHash(input.tags),
        tagAssignmentsHash: input.tagAssignments
          ? stableJsonHash(input.tagAssignments)
          : undefined,
      }),
    )
    .digest('hex');

  return {
    ok: true,
    dataset,
    classification: {
      entries: classificationEntries,
      senses: classificationSenses,
    },
    warnings,
  };
}
