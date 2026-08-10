import { createHash } from 'node:crypto';

import type { CompiledEntry, CompiledSense, TagsFile } from './model.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
  }
  return result;
}

export function stableJsonHash(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

export function tagTaxonomyHash(tags: TagsFile): string {
  return stableJsonHash(tags);
}

/**
 * Stable semantic evidence used for classification. Deliberately excludes
 * slugs, Markdown/provenance, citations, editorial metadata, timestamps,
 * search fields, and existing tag assignments so those changes do not make a
 * classification stale when the model-visible meaning is unchanged.
 */
export function classificationEntryPayload(
  entry: CompiledEntry,
  senses: CompiledSense[],
) {
  return {
    key: entry.key,
    entryType: entry.entryType,
    title: entry.title,
    aliases: [...entry.aliases].sort((a, b) => a.localeCompare(b)),
    summaryText: entry.summaryText,
    senses: senses
      .map((sense) => ({
        key: sense.key,
        order: sense.order,
        label: sense.label,
        expandedForm: sense.expandedForm,
        definitionText: sense.definitionText,
        examples: sense.examples.map((example) => example.text),
      }))
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
  };
}

export function classificationEntryHash(
  entry: CompiledEntry,
  senses: CompiledSense[],
): string {
  return sha256(JSON.stringify(classificationEntryPayload(entry, senses)));
}

export function classificationCorpusHash(
  entries: CompiledEntry[],
  senses: CompiledSense[],
): string {
  const sensesByEntry = new Map<string, CompiledSense[]>();
  for (const sense of senses) {
    const entrySenses = sensesByEntry.get(sense.entryKey) ?? [];
    entrySenses.push(sense);
    sensesByEntry.set(sense.entryKey, entrySenses);
  }
  return sha256(
    JSON.stringify(
      [...entries]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((entry) => ({
          entryKey: entry.key,
          entryContentHash: classificationEntryHash(
            entry,
            sensesByEntry.get(entry.key) ?? [],
          ),
        })),
    ),
  );
}
