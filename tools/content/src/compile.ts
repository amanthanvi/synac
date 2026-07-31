import { createHash } from 'node:crypto';

import {
  type BundleEntry,
  type BundleFile,
  type CompiledCitation,
  type CompiledDataset,
  type CompiledEntry,
  type CompiledSense,
  type CompiledSource,
  type EntryType,
  type OverrideFile,
  type RedirectsFile,
  type RelationshipType,
  type SourceFile,
  type TagsFile,
} from './model.js';
import { compactSearchDocument, markdownToText, normalizeTitle } from './text.js';

export type ContentInput = {
  sources: SourceFile[];
  tags: TagsFile;
  redirects: RedirectsFile;
  bundles: BundleFile[];
  /** Keyed by entry key ("TERM:zero-trust"), derived from the override file path. */
  overrides: Map<string, OverrideFile>;
};

export type CompileResult =
  | { ok: true; dataset: CompiledDataset; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

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
    errors.push(`source ${source.slug}: license.attributionRequirements must not be blank`);
  }
  return errors;
}

type MergedEntry = {
  entryType: EntryType;
  slug: string;
  contributions: Array<{ source: SourceFile; entry: BundleEntry }>;
  override: OverrideFile | undefined;
};

export function compileContent(input: ContentInput): CompileResult {
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
  for (const tag of input.tags.tags) {
    if (tagSlugs.has(tag.slug)) errors.push(`duplicate tag slug: ${tag.slug}`);
    tagSlugs.add(tag.slug);
  }

  // Collect bundle contributions per entry key, skipping disabled sources.
  const merged = new Map<string, MergedEntry>();
  for (const bundle of input.bundles) {
    const source = sourcesBySlug.get(bundle.source);
    if (!source) {
      errors.push(`bundle ${bundle.source}: no matching file in content/sources/`);
      continue;
    }
    if (!source.enabled) {
      warnings.push(`bundle ${bundle.source}: source is disabled; skipping its content`);
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
          errors.push(`bundle ${bundle.source}: entry ${key} has duplicate sense key ${sense.key}`);
        }
        senseKeys.add(sense.key);
        if (!documentKeys.has(sense.citation.documentKey)) {
          errors.push(
            `bundle ${bundle.source}: entry ${key} sense ${sense.key} cites unknown document ${sense.citation.documentKey}`,
          );
        }
      }
      for (const tag of entry.tags) {
        if (!tagSlugs.has(tag)) {
          errors.push(`bundle ${bundle.source}: entry ${key} references unknown tag ${tag}`);
        }
      }
      const existing = merged.get(key);
      if (existing) existing.contributions.push({ source, entry });
      else merged.set(key, { entryType: entry.entryType, slug: entry.slug, contributions: [{ source, entry }], override: undefined });
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
    if (override.editorialSenses.length > 0 && override.title && override.updatedAt) {
      merged.set(key, { entryType, slug, contributions: [], override });
    } else if (override.suppress) {
      warnings.push(`override ${key}: suppresses an entry that no bundle defines`);
    } else {
      errors.push(
        `override ${key}: matches no bundle entry; editorial-only entries need title, updatedAt, and at least one editorial sense`,
      );
    }
  }

  // Build compiled entries.
  const entries: CompiledEntry[] = [];
  const senses: CompiledSense[] = [];
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
    const entrySenses: CompiledSense[] = [];
    const suppressSenses = new Set(override?.suppressSenses ?? []);
    const usedSuppressions = new Set<string>();
    for (const { source, entry } of contributions) {
      const bundle = input.bundles.find((b) => b.source === source.slug);
      const documents = new Map((bundle?.documents ?? []).map((doc) => [doc.key, doc]));
      for (const sense of entry.senses) {
        const namespacedKey = `${source.slug}:${sense.key}`;
        if (suppressSenses.has(namespacedKey)) {
          usedSuppressions.add(namespacedKey);
          continue;
        }
        const document = documents.get(sense.citation.documentKey);
        const citations: CompiledCitation[] = document
          ? [
              {
                sourceSlug: source.slug,
                url: document.url,
                documentTitle: document.title,
                citationText: sense.citation.citationText,
                licenseNote: source.license.notes,
                attributionText: source.license.attributionRequirements,
                accessedAt: Date.parse(document.fetchedAt),
                locator: sense.citation.locator,
              },
            ]
          : [];
        entrySenses.push({
          entryKey: key,
          key: namespacedKey,
          order: entrySenses.length,
          label: sense.label,
          definitionMd: sense.definitionMd,
          definitionText: markdownToText(sense.definitionMd),
          expandedForm: sense.expandedForm,
          isEditorial: false,
          editorialRationale: undefined,
          isPreferred: false,
          examples: sense.examples.map((md) => ({ md, text: markdownToText(md) })),
          citations,
        });
      }
    }
    for (const [index, sense] of (override?.editorialSenses ?? []).entries()) {
      entrySenses.push({
        entryKey: key,
        key: `editorial:${index}`,
        order: entrySenses.length,
        label: sense.label,
        definitionMd: sense.definitionMd,
        definitionText: markdownToText(sense.definitionMd),
        expandedForm: sense.expandedForm,
        isEditorial: true,
        editorialRationale: sense.rationale,
        isPreferred: false,
        examples: sense.examples.map((md) => ({ md, text: markdownToText(md) })),
        citations: [],
      });
    }
    for (const suppressed of suppressSenses) {
      if (!usedSuppressions.has(suppressed)) {
        warnings.push(`override ${key}: suppressSenses entry ${suppressed} matches no sense`);
      }
    }
    if (entrySenses.length === 0) {
      errors.push(`entry ${key}: all senses suppressed; suppress the entry instead`);
      continue;
    }

    if (override?.preferredSense) {
      const preferredIndex = entrySenses.findIndex((sense) => sense.key === override.preferredSense);
      if (preferredIndex < 0) {
        errors.push(`override ${key}: preferredSense ${override.preferredSense} matches no sense`);
      } else if (preferredIndex > 0) {
        const [preferred] = entrySenses.splice(preferredIndex, 1);
        entrySenses.unshift(preferred);
      }
    }
    entrySenses.forEach((sense, index) => {
      sense.order = index;
      sense.isPreferred = index === 0;
    });

    const primary = contributions[0]?.entry;
    const title = override?.title ?? primary?.title;
    if (!title) {
      errors.push(`entry ${key}: no title available`);
      continue;
    }

    const aliasSeen = new Set<string>();
    const aliases: string[] = [];
    for (const alias of [...contributions.flatMap((c) => c.entry.aliases), ...(override?.addAliases ?? [])]) {
      const normalized = normalizeTitle(alias);
      if (!normalized || normalized === normalizeTitle(title) || aliasSeen.has(normalized)) continue;
      aliasSeen.add(normalized);
      aliases.push(alias);
    }

    const tags = new Set<string>(contributions.flatMap((c) => c.entry.tags));
    for (const tag of override?.addTags ?? []) {
      if (!tagSlugs.has(tag)) {
        errors.push(`override ${key}: addTags references unknown tag ${tag}`);
        continue;
      }
      tags.add(tag);
    }
    for (const tag of override?.removeTags ?? []) tags.delete(tag);

    const summaryMd = override?.summaryMd ?? contributions.find((c) => c.entry.summaryMd)?.entry.summaryMd;
    const updatedAt = Math.max(
      ...contributions.map((c) => dateMs(c.entry.updatedAt)),
      override?.updatedAt ? dateMs(override.updatedAt) : 0,
    );
    const citedSourceSlugs = [...new Set(entrySenses.flatMap((s) => s.citations.map((c) => c.sourceSlug)))].sort();

    const compiled: CompiledEntry = {
      key,
      entryType: item.entryType,
      slug: item.slug,
      title,
      normalizedTitle: normalizeTitle(title),
      aliases,
      summaryMd,
      summaryText: summaryMd ? markdownToText(summaryMd) : undefined,
      editorialNotes: override?.editorialNotes,
      updatedAt,
      searchDocument: compactSearchDocument([
        title,
        normalizeTitle(title),
        item.slug,
        summaryMd ? markdownToText(summaryMd) : undefined,
        ...entrySenses.flatMap((sense) => [sense.label, sense.expandedForm, sense.definitionText]),
        ...aliases,
      ]),
      tagSlugs: [...tags].sort(),
      citedSourceSlugs,
    };
    entries.push(compiled);
    senses.push(...entrySenses);
  }

  // Relationships: union of bundle + override relationships, both endpoints must exist.
  const entryKeys = new Set(entries.map((entry) => entry.key));
  const relationships = new Map<string, { fromKey: string; toKey: string; type: RelationshipType }>();
  for (const item of orderedMerged) {
    const fromKey = entryKey(item.entryType, item.slug);
    if (!entryKeys.has(fromKey)) continue;
    const declared = [
      ...item.contributions.flatMap((c) => c.entry.relationships.map((rel) => ({ rel, origin: `bundle ${c.source.slug}` }))),
      ...(item.override?.addRelationships ?? []).map((rel) => ({ rel, origin: 'override' })),
    ];
    for (const { rel, origin } of declared) {
      const toKey = entryKey(rel.toType, rel.toSlug);
      if (toKey === fromKey) {
        errors.push(`${origin}: entry ${fromKey} declares a relationship to itself`);
        continue;
      }
      if (suppressedKeys.has(toKey)) {
        warnings.push(`entry ${fromKey}: dropping relationship to suppressed entry ${toKey}`);
        continue;
      }
      if (!entryKeys.has(toKey)) {
        errors.push(`${origin}: entry ${fromKey} relates to unknown entry ${toKey}`);
        continue;
      }
      relationships.set(`${fromKey}->${toKey}:${rel.type}`, { fromKey, toKey, type: rel.type });
    }
  }

  // Redirects must point at live entries and must not shadow one.
  for (const redirect of input.redirects.redirects) {
    const from = entryKey(redirect.entryType, redirect.fromSlug);
    const to = entryKey(redirect.entryType, redirect.toSlug);
    if (!entryKeys.has(to)) errors.push(`redirect ${from} -> ${to}: target does not exist`);
    if (entryKeys.has(from)) errors.push(`redirect ${from} -> ${to}: source slug is a live entry`);
  }

  const usedTags = new Set(entries.flatMap((entry) => entry.tagSlugs));
  for (const tag of input.tags.tags) {
    if (!usedTags.has(tag.slug)) warnings.push(`tag ${tag.slug}: not used by any entry`);
  }

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)].sort(), warnings };

  const compiledSources: CompiledSource[] = [...sourcesBySlug.values()]
    .map((source) => ({
      slug: source.slug,
      name: source.name,
      baseUrl: source.baseUrl,
      licenseType: source.license.type,
      licenseUrl: source.license.url,
      licenseNotes: source.license.notes,
      allowedUse: source.license.allowedUse,
      attributionRequirements: source.license.attributionRequirements,
      trustTier: source.trustTier,
      enabled: source.enabled,
      lastVerifiedAt: dateMs(source.lastVerifiedAt),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const dataset: CompiledDataset = {
    contentVersion: '',
    sources: compiledSources,
    tags: [...input.tags.tags]
      .map((tag) => ({ slug: tag.slug, name: tag.name, description: tag.description }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
    entries,
    senses,
    relationships: [...relationships.values()].sort(
      (a, b) => a.fromKey.localeCompare(b.fromKey) || a.toKey.localeCompare(b.toKey) || a.type.localeCompare(b.type),
    ),
    redirects: [...input.redirects.redirects].sort(
      (a, b) => a.entryType.localeCompare(b.entryType) || a.fromSlug.localeCompare(b.fromSlug),
    ),
  };
  dataset.contentVersion = createHash('sha256')
    .update(JSON.stringify({ ...dataset, contentVersion: undefined }))
    .digest('hex');

  return { ok: true, dataset, warnings };
}
