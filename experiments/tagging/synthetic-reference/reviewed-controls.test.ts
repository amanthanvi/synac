import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hashCanonical, sha256 } from './canonical.ts';
import { auditControlFamilyCollisions, buildControls } from './controls.ts';
import { codeHash } from './manifest.ts';
import { loadReviewedControls } from './reviewed-controls.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import type {
  FrozenRubric,
  HashedClassificationEntry,
  LoadedReviewedControls,
  ReviewedControlFile,
  ReviewedControlRow,
  TagRubric,
} from './types.ts';
import { validateControls } from './validators.ts';

function entry(
  entryKey: string,
  senseKey: string,
  definitionText: string,
): HashedClassificationEntry {
  const [entryType, slug] = entryKey.split(':', 2) as [
    'TERM' | 'ACRONYM',
    string,
  ];
  const payload = {
    key: entryKey,
    entryType,
    slug,
    title: slug,
    aliases: [],
    summaryText: null,
    senses: [
      {
        key: senseKey,
        order: 0,
        label: null,
        expandedForm: null,
        definitionText,
        examples: [],
        sourceSlugs: ['fixture-source'],
      },
    ],
  };
  return { entry: payload, entryHash: hashCanonical(payload) };
}

function anchorEntries(): HashedClassificationEntry[] {
  const entries = new Map<string, HashedClassificationEntry>();
  for (const tag of FROZEN_RUBRIC.tags) {
    for (const anchor of tag.anchors) {
      const separator = anchor.entryReference.indexOf(':');
      const entryType =
        separator < 0 ? 'TERM' : anchor.entryReference.slice(0, separator);
      const slug =
        separator < 0
          ? anchor.entryReference
          : anchor.entryReference.slice(separator + 1);
      const entryKey = `${entryType}:${slug}`;
      if (!entries.has(entryKey)) {
        entries.set(
          entryKey,
          entry(
            entryKey,
            `fixture:${slug}`,
            `Public anchor source definition for ${slug}.`,
          ),
        );
      }
    }
  }
  return [...entries.values()];
}

function reviewedRows(tag: TagRubric): Readonly<{
  rows: ReviewedControlRow[];
  entries: HashedClassificationEntry[];
}> {
  const rows: ReviewedControlRow[] = [];
  const entries: HashedClassificationEntry[] = [];
  for (const polarity of ['positive', 'negative'] as const) {
    for (let index = 0; index < 25; index += 1) {
      const suffix = `${tag.id.toLowerCase()}-${polarity}-${String(index).padStart(2, '0')}`;
      const entryKey = `TERM:reviewed-${suffix}`;
      const senseKey = `fixture:${suffix}`;
      const quote = `Exact source evidence ${suffix}`;
      entries.push(
        entry(entryKey, senseKey, `${quote} with additional source context.`),
      );
      rows.push({
        entryKey,
        polarity,
        ruleId:
          polarity === 'positive'
            ? tag.inclusionRules[0].id
            : tag.exclusionRules[0].id,
        senseKey,
        quote,
        rationale:
          'The exact source quote directly entails the cited polarity-specific rubric rule.',
        primaryReviewer: `primary-${suffix}`,
        secondaryReviewer: `secondary-${suffix}`,
      });
    }
  }
  return { rows, entries };
}

async function writeReviewedFile(
  directory: string,
  tag: TagRubric,
  rows: readonly ReviewedControlRow[],
  override: Partial<ReviewedControlFile> = {},
): Promise<string> {
  const value = {
    schemaVersion: 'synac-reviewed-controls-v1' as const,
    tagId: tag.id,
    tagSlug: tag.slug,
    rows,
    ...override,
  };
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(directory, `${tag.slug}.json`), raw, 'utf8');
  return raw;
}

test('25+25 source-reviewed rows per tag produce exactly 660 deterministic controls', async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-reviewed-complete-'),
  );
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const entries = anchorEntries();
  const rawByTag = new Map<string, string>();
  for (const tag of FROZEN_RUBRIC.tags) {
    const fixture = reviewedRows(tag);
    entries.push(...fixture.entries);
    rawByTag.set(tag.id, await writeReviewedFile(directory, tag, fixture.rows));
  }

  const reviewed = await loadReviewedControls(
    directory,
    FROZEN_RUBRIC,
    entries,
  );
  assert.equal(reviewed.files.length, 11);
  assert.equal(reviewed.rows.length, 550);
  for (const file of reviewed.files)
    assert.equal(file.fileHash, sha256(rawByTag.get(file.tagId) ?? ''));
  const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
  const boundCodeHash = await codeHash(sourceDirectory, reviewed.files);
  const changedBindings = reviewed.files.map((file, index) =>
    index === 0 ? { ...file, fileHash: sha256('changed-reviewed-file') } : file,
  );
  assert.notEqual(
    boundCodeHash,
    await codeHash(sourceDirectory, changedBindings),
  );
  const controls = buildControls(
    FROZEN_RUBRIC,
    entries,
    sha256('reviewed-complete'),
    reviewed,
  );
  assert.equal(validateControls(controls), controls);
  assert.equal(controls.actualCount, 660);
  assert.equal(controls.protocolReady, true);
  assert.equal(
    controls.controls.filter(
      (control) => control.evidenceKind === 'reviewed-source-evidence',
    ).length,
    550,
  );
  for (const tag of FROZEN_RUBRIC.tags) {
    for (const label of ['applicable', 'not_applicable'] as const) {
      const stratum = controls.controls.filter(
        (control) => control.tagId === tag.id && control.label === label,
      );
      assert.equal(stratum.length, 30);
      assert.equal(
        stratum.filter(
          (control) => control.qualificationSplit === 'calibration',
        ).length,
        15,
      );
      assert.equal(
        stratum.filter((control) => control.qualificationSplit === 'validation')
          .length,
        15,
      );
    }
  }
});

test('absent reviewed JSON preserves the honest 550-control shortfall', async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-reviewed-empty-'),
  );
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const entries = anchorEntries();
  const reviewed = await loadReviewedControls(
    directory,
    FROZEN_RUBRIC,
    entries,
  );
  assert.deepEqual(reviewed, { files: [], rows: [] });
  const controls = buildControls(
    FROZEN_RUBRIC,
    entries,
    sha256('reviewed-empty'),
    reviewed,
  );
  assert.equal(controls.actualCount, 110);
  assert.equal(controls.protocolReady, false);
  assert.equal(
    controls.perTag.reduce(
      (total, report) =>
        total + report.positiveShortfall + report.negativeShortfall,
      0,
    ),
    550,
  );
});

test('reviewed loader rejects missing or foreign tag, Entry, sense, quote, rule, reviewers, and cells', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'synac-reviewed-invalid-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const tag = FROZEN_RUBRIC.tags[0];
  const live = entry(
    'TERM:live-reviewed-entry',
    'fixture:live-sense',
    'Exact live quote with context.',
  );
  const base: ReviewedControlRow = {
    entryKey: live.entry.key,
    polarity: 'positive',
    ruleId: tag.inclusionRules[0].id,
    senseKey: live.entry.senses[0].key,
    quote: 'Exact live quote',
    rationale: 'The exact source quote entails the cited inclusion rule.',
    primaryReviewer: 'reviewer-one',
    secondaryReviewer: 'reviewer-two',
  };
  const cases: ReadonlyArray<
    Readonly<{
      name: string;
      rows: readonly ReviewedControlRow[];
      override?: Partial<ReviewedControlFile>;
      pattern: RegExp;
    }>
  > = [
    {
      name: 'foreign-tag',
      rows: [base],
      override: { tagId: 'T02' },
      pattern: /tagId/,
    },
    {
      name: 'foreign-entry',
      rows: [{ ...base, entryKey: 'TERM:missing-entry' }],
      pattern: /missing or foreign live Entry/,
    },
    {
      name: 'foreign-sense',
      rows: [{ ...base, senseKey: 'fixture:missing-sense' }],
      pattern: /missing or foreign live sense/,
    },
    {
      name: 'missing-quote',
      rows: [{ ...base, quote: '' }],
      pattern: /quote.*nonempty/,
    },
    {
      name: 'foreign-quote',
      rows: [{ ...base, quote: 'Not present' }],
      pattern: /must occur exactly/,
    },
    {
      name: 'foreign-rule',
      rows: [{ ...base, ruleId: 'T02-I01' }],
      pattern: /tag inclusion rule/,
    },
    {
      name: 'wrong-polarity-rule',
      rows: [{ ...base, ruleId: tag.exclusionRules[0].id }],
      pattern: /tag inclusion rule/,
    },
    {
      name: 'reused-reviewer',
      rows: [{ ...base, secondaryReviewer: base.primaryReviewer }],
      pattern: /must be distinct/,
    },
    {
      name: 'duplicate-cell',
      rows: [
        base,
        { ...base, polarity: 'negative', ruleId: tag.exclusionRules[0].id },
      ],
      pattern: /duplicate reviewed cell/,
    },
  ];
  for (const invalid of cases) {
    await context.test(invalid.name, async () => {
      const directory = path.join(root, invalid.name);
      await mkdir(directory);
      await writeReviewedFile(directory, tag, invalid.rows, invalid.override);
      await assert.rejects(
        loadReviewedControls(directory, FROZEN_RUBRIC, [live]),
        invalid.pattern,
      );
    });
  }
  const foreignDirectory = path.join(root, 'foreign-file');
  await mkdir(foreignDirectory);
  await writeFile(
    path.join(foreignDirectory, 'foreign-tag.json'),
    JSON.stringify({
      schemaVersion: 'synac-reviewed-controls-v1',
      tagId: 'T01',
      tagSlug: 'foreign-tag',
      rows: [],
    }),
  );
  await assert.rejects(
    loadReviewedControls(foreignDirectory, FROZEN_RUBRIC, [live]),
    /file name does not identify/,
  );
});

test('combined controls reject duplicate anchors and more than 30 per polarity', async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-reviewed-quota-'),
  );
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const tag = FROZEN_RUBRIC.tags[0];
  const fixture = reviewedRows(tag);
  const extraIndex = 25;
  const extraKey = 'TERM:reviewed-t01-positive-25';
  const extraSense = 'fixture:t01-positive-25';
  const extraQuote = 'Exact source evidence t01-positive-25';
  const extraEntry = entry(extraKey, extraSense, `${extraQuote} with context.`);
  const extraRow: ReviewedControlRow = {
    entryKey: extraKey,
    polarity: 'positive',
    ruleId: tag.inclusionRules[0].id,
    senseKey: extraSense,
    quote: extraQuote,
    rationale: `The ${extraIndex}th extra source quote entails the inclusion rule.`,
    primaryReviewer: 'quota-primary',
    secondaryReviewer: 'quota-secondary',
  };
  await writeReviewedFile(directory, tag, [...fixture.rows, extraRow]);
  const entries = [...anchorEntries(), ...fixture.entries, extraEntry];
  const reviewed = await loadReviewedControls(
    directory,
    FROZEN_RUBRIC,
    entries,
  );
  assert.throws(
    () =>
      buildControls(
        FROZEN_RUBRIC,
        entries,
        sha256('reviewed-over-quota'),
        reviewed,
      ),
    /exceed 30 per polarity/,
  );

  const duplicateRubric: FrozenRubric = {
    ...FROZEN_RUBRIC,
    tags: FROZEN_RUBRIC.tags.map((candidate) =>
      candidate.id === tag.id
        ? {
            ...candidate,
            anchors: [
              ...candidate.anchors,
              { ...candidate.anchors[0], id: 'T01-P99' },
            ],
          }
        : candidate,
    ),
  };
  assert.throws(
    () =>
      buildControls(
        duplicateRubric,
        anchorEntries(),
        sha256('duplicate-anchor'),
      ),
    /duplicate control cell/,
  );
});

function loadedReviewed(
  rows: readonly Readonly<{
    tag: TagRubric;
    row: ReviewedControlRow;
  }>[],
): LoadedReviewedControls {
  return {
    files: rows.map(({ tag }, index) => ({
      tagId: tag.id,
      tagSlug: tag.slug,
      fileName: `${tag.slug}-${index}.json`,
      fileHash: sha256(`family-file-${index}`),
      rowCount: 1,
    })),
    rows: rows.map(({ tag, row }, index) => ({
      tagId: tag.id,
      tagSlug: tag.slug,
      fileHash: sha256(`family-file-${index}`),
      row,
    })),
  };
}

function familyRow(
  tag: TagRubric,
  polarity: 'positive' | 'negative',
  entryKey: string,
  senseKey: string,
  quote: string,
): ReviewedControlRow {
  return {
    entryKey,
    polarity,
    ruleId:
      polarity === 'positive'
        ? tag.inclusionRules[0].id
        : tag.exclusionRules[0].id,
    senseKey,
    quote,
    rationale:
      'Exact source evidence entails the cited polarity-specific rule.',
    primaryReviewer: `primary-${entryKey}`,
    secondaryReviewer: `secondary-${entryKey}`,
  };
}

test('qualification halves are concept-family atomic across tag strata', () => {
  const firstTag = FROZEN_RUBRIC.tags[0];
  const secondTag = FROZEN_RUBRIC.tags[1];
  const definition = 'Shared exact family evidence for two tag strata.';
  const left = entry('TERM:family-left', 'fixture:family-left', definition);
  const right = entry('TERM:family-right', 'fixture:family-right', definition);
  const reviewed = loadedReviewed([
    {
      tag: firstTag,
      row: familyRow(
        firstTag,
        'positive',
        left.entry.key,
        left.entry.senses[0].key,
        'Shared exact family evidence',
      ),
    },
    {
      tag: secondTag,
      row: familyRow(
        secondTag,
        'negative',
        right.entry.key,
        right.entry.senses[0].key,
        'Shared exact family evidence',
      ),
    },
  ]);
  const controls = buildControls(
    FROZEN_RUBRIC,
    [...anchorEntries(), left, right],
    sha256('family-atomic-qualification'),
    reviewed,
  );
  const familyControls = controls.controls.filter((control) =>
    [left.entry.key, right.entry.key].includes(control.entryKey),
  );
  assert.equal(familyControls.length, 2);
  assert.equal(
    new Set(familyControls.map((control) => control.qualificationSplit)).size,
    1,
  );
});

test('same-family reviewed and public-anchor controls stay in one qualification half', () => {
  const tag = FROZEN_RUBRIC.tags[0];
  const sharedDefinition = 'Shared duplicate family evidence.';
  const left = entry(
    'TERM:duplicate-left',
    'fixture:duplicate-left',
    sharedDefinition,
  );
  const right = entry(
    'TERM:duplicate-right',
    'fixture:duplicate-right',
    sharedDefinition,
  );
  const duplicateReviewed = loadedReviewed([
    {
      tag,
      row: familyRow(
        tag,
        'positive',
        left.entry.key,
        left.entry.senses[0].key,
        sharedDefinition,
      ),
    },
    {
      tag,
      row: familyRow(
        tag,
        'positive',
        right.entry.key,
        right.entry.senses[0].key,
        sharedDefinition,
      ),
    },
  ]);
  const duplicateAudit = auditControlFamilyCollisions(
    FROZEN_RUBRIC,
    [...anchorEntries(), left, right],
    duplicateReviewed,
  );
  assert.equal(duplicateAudit.length, 1);
  assert.deepEqual(
    new Set([
      duplicateAudit[0].left.entryKey,
      duplicateAudit[0].right.entryKey,
    ]),
    new Set([left.entry.key, right.entry.key]),
  );
  assert.ok(
    duplicateAudit[0].basis.some((basis) => basis.startsWith('definition:')),
  );
  const duplicateControls = buildControls(
    FROZEN_RUBRIC,
    [...anchorEntries(), left, right],
    sha256('same-family-reviewed'),
    duplicateReviewed,
  );
  const duplicateFamilyControls = duplicateControls.controls.filter((control) =>
    [left.entry.key, right.entry.key].includes(control.entryKey),
  );
  assert.equal(duplicateFamilyControls.length, 2);
  assert.equal(
    new Set(
      duplicateFamilyControls.map((control) => control.qualificationSplit),
    ).size,
    1,
  );

  const anchor = tag.anchors.find(
    (candidate) => candidate.polarity === 'positive',
  );
  assert.ok(anchor);
  const anchorSeparator = anchor.entryReference.indexOf(':');
  const anchorKey =
    anchorSeparator < 0
      ? `TERM:${anchor.entryReference}`
      : anchor.entryReference;
  const anchorEntry = anchorEntries().find(
    (candidate) => candidate.entry.key === anchorKey,
  );
  assert.ok(anchorEntry);
  const sibling = entry(
    'TERM:anchor-family-sibling',
    'fixture:anchor-family-sibling',
    anchorEntry.entry.senses[0].definitionText,
  );
  const anchorCollision = loadedReviewed([
    {
      tag,
      row: familyRow(
        tag,
        'positive',
        sibling.entry.key,
        sibling.entry.senses[0].key,
        sibling.entry.senses[0].definitionText,
      ),
    },
  ]);
  const anchorControls = buildControls(
    FROZEN_RUBRIC,
    [...anchorEntries(), sibling],
    sha256('anchor-family-reviewed'),
    anchorCollision,
  );
  const sharedControls = anchorControls.controls.filter((control) =>
    [anchorEntry.entry.key, sibling.entry.key].includes(control.entryKey),
  );
  assert.equal(sharedControls.length, 2);
  assert.equal(
    new Set(sharedControls.map((control) => control.qualificationSplit)).size,
    1,
  );
});
