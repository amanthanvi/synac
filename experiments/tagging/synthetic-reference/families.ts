import {
  hashCanonical,
  normalizeConcept,
  normalizeWhitespace,
  seededOrder,
  sha256,
} from './canonical.ts';
import type {
  ConceptFamily,
  HashedClassificationEntry,
  ReferenceSplit,
  SplitAssignment,
  SplitPlan,
} from './types.ts';

class UnionFind {
  readonly #parent = new Map<string, string>();

  add(value: string): void {
    if (!this.#parent.has(value)) this.#parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.#parent.get(value);
    if (parent === undefined)
      throw new Error(`unknown union-find value ${value}`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.#parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    this.#parent.set(second, first);
  }
}

export function conceptCollisionSignals(
  value: HashedClassificationEntry,
): readonly string[] {
  const { entry } = value;
  const signals = new Set<string>();
  const exactTitle = normalizeWhitespace(entry.title);
  const normalizedTitle = normalizeConcept(entry.title);
  if (exactTitle) signals.add(`title-exact:${exactTitle}`);
  if (normalizedTitle) signals.add(`title-normalized:${normalizedTitle}`);

  const conservativeSingular = (identity: string): string | null => {
    const normalized = normalizeConcept(identity);
    if (
      !/^[\p{Letter}\p{Number}]+$/u.test(normalized) ||
      normalized.length < 5 ||
      !normalized.endsWith('s') ||
      normalized.endsWith('ss') ||
      normalized.endsWith('ies') ||
      normalized.endsWith('ses')
    ) {
      return null;
    }
    return normalized.slice(0, -1);
  };
  const singularTitle = conservativeSingular(entry.title) ?? normalizedTitle;
  if (
    singularTitle &&
    /^[\p{Letter}\p{Number}]+$/u.test(normalizedTitle) &&
    [entry.slug, ...entry.aliases].some((identity) => {
      const normalizedIdentity = normalizeConcept(identity);
      return (
        normalizedIdentity === normalizedTitle &&
        (conservativeSingular(identity) ?? normalizedIdentity) === singularTitle
      );
    })
  ) {
    signals.add(`singular-corroborated:${singularTitle}`);
  }

  for (const identity of [entry.slug, ...entry.aliases]) {
    const normalized = normalizeConcept(identity);
    if (normalized) signals.add(`slug-alias:${normalized}`);
  }
  for (const sense of entry.senses) {
    const definition = normalizeWhitespace(sense.definitionText);
    if (definition) signals.add(`definition:${sha256(definition)}`);
  }
  return [...signals].sort();
}

export function resolveEntryReference(
  entries: readonly HashedClassificationEntry[],
  reference: string,
): HashedClassificationEntry {
  const separator = reference.indexOf(':');
  const entryType = separator < 0 ? undefined : reference.slice(0, separator);
  const slug = separator < 0 ? reference : reference.slice(separator + 1);
  const matches = entries.filter(
    (value) =>
      value.entry.slug === slug &&
      (entryType === undefined || value.entry.entryType === entryType),
  );
  if (matches.length !== 1) {
    throw new Error(
      `anchor ${reference}: expected exactly one compiled entry, got ${matches.length}`,
    );
  }
  return matches[0];
}

export function buildConceptFamilies(
  entries: readonly HashedClassificationEntry[],
  forcedDevelopmentKeys: ReadonlySet<string>,
): readonly ConceptFamily[] {
  const unionFind = new UnionFind();
  const ownerBySignal = new Map<string, string>();
  for (const value of [...entries].sort((a, b) =>
    a.entry.key.localeCompare(b.entry.key),
  )) {
    const key = value.entry.key;
    unionFind.add(key);
    for (const signal of conceptCollisionSignals(value)) {
      const owner = ownerBySignal.get(signal);
      if (owner === undefined) ownerBySignal.set(signal, key);
      else unionFind.union(owner, key);
    }
  }

  const keysByRoot = new Map<string, string[]>();
  for (const value of entries) {
    const root = unionFind.find(value.entry.key);
    const keys = keysByRoot.get(root) ?? [];
    keys.push(value.entry.key);
    keysByRoot.set(root, keys);
  }
  return [...keysByRoot.values()]
    .map((entryKeys) => {
      entryKeys.sort();
      return {
        familyId: hashCanonical(entryKeys),
        entryKeys,
        forcedDevelopment: entryKeys.some((key) =>
          forcedDevelopmentKeys.has(key),
        ),
      };
    })
    .sort((a, b) => a.familyId.localeCompare(b.familyId));
}

export const SPLIT_CAPACITIES: Readonly<Record<ReferenceSplit, number>> =
  Object.freeze({
    development: 800,
    calibration: 300,
    validation: 300,
    audit: 100,
  });

export function buildSplitPlan(
  families: readonly ConceptFamily[],
  selectionSeed: string,
): SplitPlan {
  const remaining = new Map(
    families.map((family) => [family.familyId, family]),
  );
  const assignments: SplitAssignment[] = [];
  const counts: Record<ReferenceSplit, number> = {
    development: 0,
    calibration: 0,
    validation: 0,
    audit: 0,
  };

  const assign = (family: ConceptFamily, split: ReferenceSplit): void => {
    assignments.push({ ...family, split });
    counts[split] += family.entryKeys.length;
    remaining.delete(family.familyId);
  };

  const forcedDevelopment = families
    .filter((family) => family.forcedDevelopment)
    .sort((a, b) => a.familyId.localeCompare(b.familyId));
  for (const family of forcedDevelopment) assign(family, 'development');
  if (counts.development > SPLIT_CAPACITIES.development) {
    throw new Error(
      `control-evidence families require ${counts.development} development entries; capacity is 800`,
    );
  }

  const ordered = [...families].sort(
    (a, b) =>
      seededOrder(selectionSeed, a.familyId).localeCompare(
        seededOrder(selectionSeed, b.familyId),
      ) || a.familyId.localeCompare(b.familyId),
  );
  for (const split of [
    'development',
    'calibration',
    'validation',
    'audit',
  ] as const) {
    let required = SPLIT_CAPACITIES[split] - counts[split];
    for (const family of ordered) {
      if (required === 0) break;
      if (!remaining.has(family.familyId) || family.entryKeys.length > required)
        continue;
      assign(family, split);
      required -= family.entryKeys.length;
    }
    if (required !== 0) {
      throw new Error(
        `cannot fill ${split} without splitting a concept family; ${required} entries short`,
      );
    }
  }

  assignments.sort(
    (a, b) =>
      a.split.localeCompare(b.split) || a.familyId.localeCompare(b.familyId),
  );
  const core = {
    schemaVersion: 'synac-family-split-v1' as const,
    selectionSeed,
    capacities: SPLIT_CAPACITIES,
    counts,
    assignments,
  };
  return { ...core, splitHash: hashCanonical(core) };
}

export function selectSplitEntries(
  entries: readonly HashedClassificationEntry[],
  plan: SplitPlan,
): readonly HashedClassificationEntry[] {
  const selectedKeys = new Set(
    plan.assignments.flatMap((assignment) => assignment.entryKeys),
  );
  const selected = entries.filter((value) => selectedKeys.has(value.entry.key));
  if (selected.length !== 1500)
    throw new Error(`split selected ${selected.length} entries, expected 1500`);
  return selected.sort((a, b) => a.entry.key.localeCompare(b.entry.key));
}
