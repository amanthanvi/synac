import { hashCanonical } from './canonical.ts';
import type {
  ClassificationEntry,
  CorpusSnapshot,
  HashedClassificationEntry,
} from './types.ts';

type CompiledEntryLike = Readonly<{
  key: string;
  entryType: 'TERM' | 'ACRONYM';
  slug: string;
  title: string;
  aliases: readonly string[];
  summaryText: string | undefined;
}>;

type CompiledSenseLike = Readonly<{
  entryKey: string;
  key: string;
  order: number;
  label: string | undefined;
  expandedForm: string | undefined;
  definitionText: string;
  examples: readonly Readonly<{ text: string }>[];
  citations: readonly Readonly<{ sourceSlug: string }>[];
}>;

export function classificationEntryPayload(
  entry: CompiledEntryLike,
  senses: readonly CompiledSenseLike[],
): ClassificationEntry {
  return {
    key: entry.key,
    entryType: entry.entryType,
    slug: entry.slug,
    title: entry.title,
    aliases: [...entry.aliases].sort((a, b) => a.localeCompare(b)),
    summaryText: entry.summaryText ?? null,
    senses: senses
      .map((sense) => ({
        key: sense.key,
        order: sense.order,
        label: sense.label ?? null,
        expandedForm: sense.expandedForm ?? null,
        definitionText: sense.definitionText,
        examples: sense.examples.map((example) => example.text),
        sourceSlugs: [
          ...new Set(sense.citations.map((citation) => citation.sourceSlug)),
        ].sort(),
      }))
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
  };
}

export function compileClassificationEntries(
  entries: readonly CompiledEntryLike[],
  senses: readonly CompiledSenseLike[],
): readonly HashedClassificationEntry[] {
  const sensesByEntry = new Map<string, CompiledSenseLike[]>();
  for (const sense of senses) {
    const values = sensesByEntry.get(sense.entryKey) ?? [];
    values.push(sense);
    sensesByEntry.set(sense.entryKey, values);
  }
  return entries
    .map((entry) => {
      const payload = classificationEntryPayload(
        entry,
        sensesByEntry.get(entry.key) ?? [],
      );
      return { entry: payload, entryHash: hashCanonical(payload) };
    })
    .sort((a, b) => a.entry.key.localeCompare(b.entry.key));
}

export function corpusSnapshot(
  contentVersion: string,
  entries: readonly HashedClassificationEntry[],
): CorpusSnapshot {
  const core = {
    schemaVersion: 'synac-classification-corpus-v1' as const,
    contentVersion,
    entries: [...entries].sort((a, b) =>
      a.entry.key.localeCompare(b.entry.key),
    ),
  };
  return { ...core, corpusHash: hashCanonical(core) };
}
