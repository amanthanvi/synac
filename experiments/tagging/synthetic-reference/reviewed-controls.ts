import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { sha256 } from './canonical.ts';
import type {
  FrozenRubric,
  HashedClassificationEntry,
  LoadedReviewedControl,
  LoadedReviewedControls,
  ReviewedControlFile,
  ReviewedControlRow,
  TagRubric,
} from './types.ts';

function fail(location: string, message: string): never {
  throw new Error(`${location}: ${message}`);
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(location, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  location: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) {
    fail(
      location,
      `expected exactly keys [${expected.join(', ')}], got [${actual.join(', ')}]`,
    );
  }
}

function nonemptyString(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    fail(location, 'must be a nonempty string');
  return value;
}

function validateRow(value: unknown, location: string): ReviewedControlRow {
  const row = record(value, location);
  exactKeys(
    row,
    [
      'entryKey',
      'polarity',
      'ruleId',
      'senseKey',
      'quote',
      'rationale',
      'primaryReviewer',
      'secondaryReviewer',
    ],
    location,
  );
  const entryKey = nonemptyString(row.entryKey, `${location}.entryKey`);
  if (!/^(TERM|ACRONYM):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entryKey)) {
    fail(`${location}.entryKey`, 'must be a canonical live Entry key');
  }
  if (row.polarity !== 'positive' && row.polarity !== 'negative') {
    fail(`${location}.polarity`, 'must be positive or negative');
  }
  const ruleId = nonemptyString(row.ruleId, `${location}.ruleId`);
  const senseKey = nonemptyString(row.senseKey, `${location}.senseKey`);
  const quote = nonemptyString(row.quote, `${location}.quote`);
  const rationale = nonemptyString(row.rationale, `${location}.rationale`);
  if (rationale.trim().split(/\s+/).length > 60)
    fail(`${location}.rationale`, 'must be at most 60 words');
  const primaryReviewer = nonemptyString(
    row.primaryReviewer,
    `${location}.primaryReviewer`,
  );
  const secondaryReviewer = nonemptyString(
    row.secondaryReviewer,
    `${location}.secondaryReviewer`,
  );
  if (
    primaryReviewer !== primaryReviewer.trim() ||
    secondaryReviewer !== secondaryReviewer.trim()
  ) {
    fail(
      location,
      'reviewer IDs must not contain leading or trailing whitespace',
    );
  }
  if (primaryReviewer === secondaryReviewer)
    fail(location, 'primaryReviewer and secondaryReviewer must be distinct');
  return {
    entryKey,
    polarity: row.polarity,
    ruleId,
    senseKey,
    quote,
    rationale,
    primaryReviewer,
    secondaryReviewer,
  };
}

function validateFile(
  value: unknown,
  tag: TagRubric,
  fileName: string,
): ReviewedControlFile {
  const location = `reviewed-controls/${fileName}`;
  const root = record(value, location);
  exactKeys(root, ['schemaVersion', 'tagId', 'tagSlug', 'rows'], location);
  if (root.schemaVersion !== 'synac-reviewed-controls-v1') {
    fail(`${location}.schemaVersion`, 'must equal synac-reviewed-controls-v1');
  }
  if (root.tagId !== tag.id) fail(`${location}.tagId`, `must equal ${tag.id}`);
  if (root.tagSlug !== tag.slug)
    fail(`${location}.tagSlug`, `must equal ${tag.slug}`);
  if (!Array.isArray(root.rows)) fail(`${location}.rows`, 'must be an array');
  const rows = root.rows.map((row, index) =>
    validateRow(row, `${location}.rows[${index}]`),
  );
  return {
    schemaVersion: 'synac-reviewed-controls-v1',
    tagId: tag.id,
    tagSlug: tag.slug,
    rows,
  };
}

function validateEvidence(
  loaded: LoadedReviewedControl,
  tag: TagRubric,
  globalRuleIds: ReadonlySet<string>,
  entriesByKey: ReadonlyMap<string, HashedClassificationEntry>,
): void {
  const location = `reviewed-controls/${tag.slug}.json/${loaded.row.entryKey}`;
  const entry = entriesByKey.get(loaded.row.entryKey);
  if (!entry)
    fail(`${location}.entryKey`, 'references a missing or foreign live Entry');
  const sense = entry.entry.senses.find(
    (candidate) => candidate.key === loaded.row.senseKey,
  );
  if (!sense)
    fail(`${location}.senseKey`, 'references a missing or foreign live sense');
  const quoteFields = [
    sense.definitionText,
    sense.label,
    sense.expandedForm,
    ...sense.examples,
  ].filter((candidate): candidate is string => candidate !== null);
  if (!quoteFields.some((candidate) => candidate.includes(loaded.row.quote))) {
    fail(
      `${location}.quote`,
      'must occur exactly in the referenced sense definition, label, expanded form, or example',
    );
  }
  const polarityRuleIds = new Set(
    (loaded.row.polarity === 'positive'
      ? tag.inclusionRules
      : tag.exclusionRules
    ).map((rule) => rule.id),
  );
  if (
    !globalRuleIds.has(loaded.row.ruleId) &&
    !polarityRuleIds.has(loaded.row.ruleId)
  ) {
    fail(
      `${location}.ruleId`,
      `must be a global rule or a ${loaded.row.polarity === 'positive' ? 'tag inclusion' : 'tag exclusion'} rule`,
    );
  }
}

export async function loadReviewedControls(
  directory: string,
  rubric: FrozenRubric,
  entries: readonly HashedClassificationEntry[],
): Promise<LoadedReviewedControls> {
  let names: string[];
  try {
    names = (await readdir(directory))
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { files: [], rows: [] };
    throw error;
  }
  const tagsBySlug = new Map(rubric.tags.map((tag) => [tag.slug, tag]));
  const globalRuleIds = new Set(rubric.globalRules.map((rule) => rule.id));
  const entriesByKey = new Map(
    entries.map((entry) => [entry.entry.key, entry]),
  );
  const files = [];
  const rows: LoadedReviewedControl[] = [];
  for (const fileName of names) {
    const tagSlug = fileName.slice(0, -'.json'.length);
    const tag = tagsBySlug.get(tagSlug);
    if (!tag)
      fail(
        `reviewed-controls/${fileName}`,
        'file name does not identify a frozen rubric tag',
      );
    let parsed: unknown;
    let raw: string;
    try {
      raw = await readFile(path.join(directory, fileName), 'utf8');
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`reviewed-controls/${fileName}: invalid JSON`, {
        cause: error,
      });
    }
    const reviewedFile = validateFile(parsed, tag, fileName);
    const fileHash = sha256(raw);
    files.push({
      tagId: tag.id,
      tagSlug: tag.slug,
      fileName,
      fileHash,
      rowCount: reviewedFile.rows.length,
    });
    for (const row of reviewedFile.rows) {
      const loaded = { tagId: tag.id, tagSlug: tag.slug, fileHash, row };
      validateEvidence(loaded, tag, globalRuleIds, entriesByKey);
      rows.push(loaded);
    }
  }
  const cells = new Set<string>();
  for (const loaded of rows) {
    const cell = `${loaded.tagId}\0${loaded.row.entryKey}`;
    if (cells.has(cell))
      fail(
        `reviewed-controls/${loaded.tagSlug}.json`,
        `duplicate reviewed cell ${loaded.row.entryKey}/${loaded.tagId}`,
      );
    cells.add(cell);
  }
  return { files, rows };
}
