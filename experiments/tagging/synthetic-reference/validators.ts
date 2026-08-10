import { Buffer } from 'node:buffer';

import { hashCanonical, isSha256 } from './canonical.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import type {
  ClassificationEntry,
  ClassificationResponse,
  ControlSuite,
  CorpusSnapshot,
  FrozenRubric,
  InjectionSuite,
  ModelLane,
  ModelLineages,
  RunManifest,
  RuntimeConfig,
  SplitPlan,
  TagId,
} from './types.ts';
import { TAG_IDS } from './types.ts';

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'must be an object');
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) {
    fail(
      path,
      `expected exactly keys [${expected.join(', ')}], got [${actual.join(', ')}]`,
    );
  }
}

function stringValue(value: unknown, path: string, minimum = 1): string {
  if (typeof value !== 'string' || value.length < minimum)
    fail(path, `must be a string of length >= ${minimum}`);
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be boolean');
  return value;
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    fail(path, `must be an integer in ${minimum}..${maximum}`);
  }
  return value as number;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) fail(path, `must equal ${JSON.stringify(expected)}`);
  return expected;
}

function sha(value: unknown, path: string): string {
  if (!isSha256(value)) fail(path, 'must be sha256:<64 lowercase hex>');
  return value;
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length)
    fail(path, 'must not contain duplicates');
}

export function validateRubric(value: unknown): FrozenRubric {
  const root = record(value, 'rubric');
  exactKeys(
    root,
    [
      'schemaVersion',
      'taxonomyVersion',
      'protocolVersion',
      'globalRules',
      'tags',
    ],
    'rubric',
  );
  literal(root.schemaVersion, 'synac-tag-rubric-v2', 'rubric.schemaVersion');
  literal(root.taxonomyVersion, '2', 'rubric.taxonomyVersion');
  literal(
    root.protocolVersion,
    'synac-ai-adjudication-v1',
    'rubric.protocolVersion',
  );
  const globalRuleIds = array(root.globalRules, 'rubric.globalRules').map(
    (item, index) => {
      const rule = record(item, `rubric.globalRules[${index}]`);
      exactKeys(rule, ['id', 'text'], `rubric.globalRules[${index}]`);
      stringValue(rule.text, `rubric.globalRules[${index}].text`);
      return stringValue(rule.id, `rubric.globalRules[${index}].id`);
    },
  );
  unique(globalRuleIds, 'rubric.globalRules[].id');
  const tags = array(root.tags, 'rubric.tags');
  if (tags.length !== 11) fail('rubric.tags', 'must contain exactly 11 tags');
  const seenSlugs: string[] = [];
  tags.forEach((item, index) => {
    const tag = record(item, `rubric.tags[${index}]`);
    exactKeys(
      tag,
      [
        'id',
        'slug',
        'name',
        'definition',
        'inclusionRules',
        'exclusionRules',
        'anchors',
      ],
      `rubric.tags[${index}]`,
    );
    const tagId = literal(tag.id, TAG_IDS[index], `rubric.tags[${index}].id`);
    seenSlugs.push(stringValue(tag.slug, `rubric.tags[${index}].slug`));
    stringValue(tag.name, `rubric.tags[${index}].name`);
    stringValue(tag.definition, `rubric.tags[${index}].definition`);
    const ruleIds: string[] = [];
    for (const [property, marker] of [
      ['inclusionRules', 'I'],
      ['exclusionRules', 'E'],
    ] as const) {
      const rules = array(tag[property], `rubric.tags[${index}].${property}`);
      if (rules.length === 0)
        fail(`rubric.tags[${index}].${property}`, 'must not be empty');
      rules.forEach((ruleValue, ruleIndex) => {
        const rule = record(
          ruleValue,
          `rubric.tags[${index}].${property}[${ruleIndex}]`,
        );
        exactKeys(
          rule,
          ['id', 'text'],
          `rubric.tags[${index}].${property}[${ruleIndex}]`,
        );
        const expected = `${tagId}-${marker}${String(ruleIndex + 1).padStart(2, '0')}`;
        ruleIds.push(
          literal(
            rule.id,
            expected,
            `rubric.tags[${index}].${property}[${ruleIndex}].id`,
          ),
        );
        stringValue(
          rule.text,
          `rubric.tags[${index}].${property}[${ruleIndex}].text`,
        );
      });
    }
    unique(ruleIds, `rubric.tags[${index}].rules`);
    const anchors = array(tag.anchors, `rubric.tags[${index}].anchors`);
    if (anchors.length !== 10)
      fail(
        `rubric.tags[${index}].anchors`,
        'must contain five positive and five negative anchors',
      );
    anchors.forEach((anchorValue, anchorIndex) => {
      const anchor = record(
        anchorValue,
        `rubric.tags[${index}].anchors[${anchorIndex}]`,
      );
      exactKeys(
        anchor,
        ['id', 'entryReference', 'polarity'],
        `rubric.tags[${index}].anchors[${anchorIndex}]`,
      );
      const positive = anchorIndex < 5;
      literal(
        anchor.id,
        `${tagId}-${positive ? 'P' : 'N'}${String((anchorIndex % 5) + 1).padStart(2, '0')}`,
        `rubric.tags[${index}].anchors[${anchorIndex}].id`,
      );
      literal(
        anchor.polarity,
        positive ? 'positive' : 'negative',
        `rubric.tags[${index}].anchors[${anchorIndex}].polarity`,
      );
      stringValue(
        anchor.entryReference,
        `rubric.tags[${index}].anchors[${anchorIndex}].entryReference`,
      );
    });
  });
  unique(seenSlugs, 'rubric.tags[].slug');
  return value as FrozenRubric;
}

function validateEntry(value: unknown, path: string): void {
  const item = record(value, path);
  exactKeys(
    item,
    ['key', 'entryType', 'slug', 'title', 'aliases', 'summaryText', 'senses'],
    path,
  );
  const key = stringValue(item.key, `${path}.key`);
  if (!/^(TERM|ACRONYM):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key))
    fail(`${path}.key`, 'has invalid entry-key syntax');
  if (item.entryType !== 'TERM' && item.entryType !== 'ACRONYM')
    fail(`${path}.entryType`, 'must be TERM or ACRONYM');
  stringValue(item.slug, `${path}.slug`);
  stringValue(item.title, `${path}.title`);
  array(item.aliases, `${path}.aliases`).forEach((alias, index) =>
    stringValue(alias, `${path}.aliases[${index}]`),
  );
  if (item.summaryText !== null)
    stringValue(item.summaryText, `${path}.summaryText`);
  array(item.senses, `${path}.senses`).forEach((senseValue, index) => {
    const sense = record(senseValue, `${path}.senses[${index}]`);
    exactKeys(
      sense,
      [
        'key',
        'order',
        'label',
        'expandedForm',
        'definitionText',
        'examples',
        'sourceSlugs',
      ],
      `${path}.senses[${index}]`,
    );
    stringValue(sense.key, `${path}.senses[${index}].key`);
    integer(
      sense.order,
      `${path}.senses[${index}].order`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (sense.label !== null)
      stringValue(sense.label, `${path}.senses[${index}].label`);
    if (sense.expandedForm !== null)
      stringValue(sense.expandedForm, `${path}.senses[${index}].expandedForm`);
    stringValue(
      sense.definitionText,
      `${path}.senses[${index}].definitionText`,
    );
    array(sense.examples, `${path}.senses[${index}].examples`).forEach(
      (example, exampleIndex) =>
        stringValue(
          example,
          `${path}.senses[${index}].examples[${exampleIndex}]`,
        ),
    );
    array(sense.sourceSlugs, `${path}.senses[${index}].sourceSlugs`).forEach(
      (source, sourceIndex) =>
        stringValue(
          source,
          `${path}.senses[${index}].sourceSlugs[${sourceIndex}]`,
        ),
    );
  });
}

export function validateCorpus(value: unknown): CorpusSnapshot {
  const root = record(value, 'corpus');
  exactKeys(
    root,
    ['schemaVersion', 'contentVersion', 'entries', 'corpusHash'],
    'corpus',
  );
  literal(
    root.schemaVersion,
    'synac-classification-corpus-v1',
    'corpus.schemaVersion',
  );
  stringValue(root.contentVersion, 'corpus.contentVersion');
  const entries = array(root.entries, 'corpus.entries');
  if (entries.length !== 1500)
    fail('corpus.entries', 'must contain exactly 1,500 entries');
  const keys: string[] = [];
  entries.forEach((entryValue, index) => {
    const wrapper = record(entryValue, `corpus.entries[${index}]`);
    exactKeys(wrapper, ['entry', 'entryHash'], `corpus.entries[${index}]`);
    validateEntry(wrapper.entry, `corpus.entries[${index}].entry`);
    const entry = wrapper.entry as ClassificationEntry;
    keys.push(entry.key);
    const expected = hashCanonical(entry);
    if (wrapper.entryHash !== expected)
      fail(`corpus.entries[${index}].entryHash`, `expected ${expected}`);
  });
  unique(keys, 'corpus.entries[].entry.key');
  const expectedHash = hashCanonical({
    schemaVersion: root.schemaVersion,
    contentVersion: root.contentVersion,
    entries: root.entries,
  });
  if (root.corpusHash !== expectedHash)
    fail('corpus.corpusHash', `expected ${expectedHash}`);
  return value as CorpusSnapshot;
}

export function validateSplit(
  plan: unknown,
  corpus: CorpusSnapshot,
  forcedDevelopmentKeys: ReadonlySet<string>,
): SplitPlan {
  const root = record(plan, 'split');
  exactKeys(
    root,
    [
      'schemaVersion',
      'selectionSeed',
      'capacities',
      'counts',
      'assignments',
      'splitHash',
    ],
    'split',
  );
  literal(root.schemaVersion, 'synac-family-split-v1', 'split.schemaVersion');
  sha(root.selectionSeed, 'split.selectionSeed');
  const expectedCounts = {
    development: 800,
    calibration: 300,
    validation: 300,
    audit: 100,
  } as const;
  for (const property of ['capacities', 'counts'] as const) {
    const values = record(root[property], `split.${property}`);
    exactKeys(values, Object.keys(expectedCounts), `split.${property}`);
    for (const [split, count] of Object.entries(expectedCounts))
      literal(values[split], count, `split.${property}.${split}`);
  }
  const knownKeys = new Set(corpus.entries.map((value) => value.entry.key));
  const assignedKeys: string[] = [];
  const familyIds: string[] = [];
  array(root.assignments, 'split.assignments').forEach(
    (assignmentValue, index) => {
      const assignment = record(assignmentValue, `split.assignments[${index}]`);
      exactKeys(
        assignment,
        ['familyId', 'entryKeys', 'split', 'forcedDevelopment'],
        `split.assignments[${index}]`,
      );
      familyIds.push(
        sha(assignment.familyId, `split.assignments[${index}].familyId`),
      );
      if (
        !['development', 'calibration', 'validation', 'audit'].includes(
          String(assignment.split),
        )
      )
        fail(`split.assignments[${index}].split`, 'unknown split');
      booleanValue(
        assignment.forcedDevelopment,
        `split.assignments[${index}].forcedDevelopment`,
      );
      array(
        assignment.entryKeys,
        `split.assignments[${index}].entryKeys`,
      ).forEach((keyValue, keyIndex) => {
        const key = stringValue(
          keyValue,
          `split.assignments[${index}].entryKeys[${keyIndex}]`,
        );
        if (!knownKeys.has(key))
          fail(
            `split.assignments[${index}].entryKeys[${keyIndex}]`,
            'not present in corpus',
          );
        if (
          forcedDevelopmentKeys.has(key) &&
          assignment.split !== 'development'
        )
          fail(
            `split.assignments[${index}]`,
            'control-evidence family must be development',
          );
        assignedKeys.push(key);
      });
    },
  );
  unique(familyIds, 'split.assignments[].familyId');
  unique(assignedKeys, 'split.assignments[].entryKeys');
  if (assignedKeys.length !== 1500)
    fail('split.assignments', 'must assign exactly 1,500 entries');
  const expectedHash = hashCanonical({
    schemaVersion: root.schemaVersion,
    selectionSeed: root.selectionSeed,
    capacities: root.capacities,
    counts: root.counts,
    assignments: root.assignments,
  });
  if (root.splitHash !== expectedHash)
    fail('split.splitHash', `expected ${expectedHash}`);
  return plan as SplitPlan;
}

export function validateControls(value: unknown): ControlSuite {
  const root = record(value, 'controls');
  exactKeys(
    root,
    [
      'schemaVersion',
      'targetCount',
      'actualCount',
      'protocolReady',
      'reviewedFiles',
      'controls',
      'perTag',
      'controlHash',
    ],
    'controls',
  );
  literal(
    root.schemaVersion,
    'synac-source-controls-v1',
    'controls.schemaVersion',
  );
  literal(root.targetCount, 660, 'controls.targetCount');
  const controls = array(root.controls, 'controls.controls');
  literal(root.actualCount, controls.length, 'controls.actualCount');
  booleanValue(root.protocolReady, 'controls.protocolReady');
  const reviewedFiles = array(root.reviewedFiles, 'controls.reviewedFiles');
  const reviewedBindings = new Map<
    string,
    { tagId: string; rowCount: number }
  >();
  reviewedFiles.forEach((fileValue, index) => {
    const file = record(fileValue, `controls.reviewedFiles[${index}]`);
    exactKeys(
      file,
      ['tagId', 'tagSlug', 'fileName', 'fileHash', 'rowCount'],
      `controls.reviewedFiles[${index}]`,
    );
    if (!TAG_IDS.includes(file.tagId as TagId))
      fail(`controls.reviewedFiles[${index}].tagId`, 'unknown tag');
    const tagSlug = stringValue(
      file.tagSlug,
      `controls.reviewedFiles[${index}].tagSlug`,
    );
    const frozenTag = FROZEN_RUBRIC.tags.find((tag) => tag.id === file.tagId);
    if (!frozenTag || frozenTag.slug !== tagSlug)
      fail(
        `controls.reviewedFiles[${index}].tagSlug`,
        'does not match the frozen tag',
      );
    literal(
      file.fileName,
      `${tagSlug}.json`,
      `controls.reviewedFiles[${index}].fileName`,
    );
    const fileHash = sha(
      file.fileHash,
      `controls.reviewedFiles[${index}].fileHash`,
    );
    const rowCount = integer(
      file.rowCount,
      `controls.reviewedFiles[${index}].rowCount`,
      0,
      50,
    );
    if (reviewedBindings.has(fileHash))
      fail(
        `controls.reviewedFiles[${index}].fileHash`,
        'duplicate reviewed file hash',
      );
    reviewedBindings.set(fileHash, { tagId: String(file.tagId), rowCount });
  });
  const controlIds: string[] = [];
  const controlCells: string[] = [];
  const reviewedCounts = new Map<string, number>();
  controls.forEach((controlValue, index) => {
    const control = record(controlValue, `controls.controls[${index}]`);
    const path = `controls.controls[${index}]`;
    const controlId = stringValue(control.controlId, `${path}.controlId`);
    controlIds.push(controlId);
    if (!TAG_IDS.includes(control.tagId as TagId))
      fail(`${path}.tagId`, 'unknown tag');
    const entryKey = stringValue(control.entryKey, `${path}.entryKey`);
    controlCells.push(`${String(control.tagId)}\0${entryKey}`);
    sha(control.entryHash, `${path}.entryHash`);
    if (control.label !== 'applicable' && control.label !== 'not_applicable')
      fail(`${path}.label`, 'unknown label');
    if (
      control.qualificationSplit !== 'calibration' &&
      control.qualificationSplit !== 'validation'
    )
      fail(`${path}.qualificationSplit`, 'unknown qualification split');
    if (control.evidenceKind === 'public-rubric-anchor') {
      exactKeys(
        control,
        [
          'controlId',
          'tagId',
          'entryKey',
          'entryHash',
          'label',
          'rubricAnchorId',
          'evidenceKind',
          'qualificationSplit',
        ],
        path,
      );
      literal(control.rubricAnchorId, controlId, `${path}.rubricAnchorId`);
      const tag = FROZEN_RUBRIC.tags.find(
        (candidate) => candidate.id === control.tagId,
      );
      const anchor = tag?.anchors.find(
        (candidate) => candidate.id === controlId,
      );
      if (!anchor)
        fail(
          `${path}.rubricAnchorId`,
          'is not a frozen public anchor for this tag',
        );
      literal(
        control.label,
        anchor.polarity === 'positive' ? 'applicable' : 'not_applicable',
        `${path}.label`,
      );
    } else if (control.evidenceKind === 'reviewed-source-evidence') {
      exactKeys(
        control,
        [
          'controlId',
          'tagId',
          'entryKey',
          'entryHash',
          'label',
          'ruleId',
          'senseKey',
          'quote',
          'rationale',
          'primaryReviewer',
          'secondaryReviewer',
          'reviewedFileHash',
          'evidenceKind',
          'qualificationSplit',
        ],
        path,
      );
      const ruleId = stringValue(control.ruleId, `${path}.ruleId`);
      const tag = FROZEN_RUBRIC.tags.find(
        (candidate) => candidate.id === control.tagId,
      );
      const allowedRuleIds = new Set([
        ...FROZEN_RUBRIC.globalRules.map((rule) => rule.id),
        ...((control.label === 'applicable'
          ? tag?.inclusionRules
          : tag?.exclusionRules
        )?.map((rule) => rule.id) ?? []),
      ]);
      if (!allowedRuleIds.has(ruleId))
        fail(
          `${path}.ruleId`,
          'is not a frozen global or polarity-compatible tag rule',
        );
      const senseKey = stringValue(control.senseKey, `${path}.senseKey`);
      const quote = stringValue(control.quote, `${path}.quote`);
      const rationale = stringValue(control.rationale, `${path}.rationale`);
      if (rationale.trim().split(/\s+/).length > 60)
        fail(`${path}.rationale`, 'must be at most 60 words');
      const primaryReviewer = stringValue(
        control.primaryReviewer,
        `${path}.primaryReviewer`,
      );
      const secondaryReviewer = stringValue(
        control.secondaryReviewer,
        `${path}.secondaryReviewer`,
      );
      if (primaryReviewer === secondaryReviewer)
        fail(path, 'primaryReviewer and secondaryReviewer must be distinct');
      const reviewedFileHash = sha(
        control.reviewedFileHash,
        `${path}.reviewedFileHash`,
      );
      const binding = reviewedBindings.get(reviewedFileHash);
      if (!binding || binding.tagId !== control.tagId)
        fail(
          `${path}.reviewedFileHash`,
          'does not bind the reviewed file for this tag',
        );
      reviewedCounts.set(
        reviewedFileHash,
        (reviewedCounts.get(reviewedFileHash) ?? 0) + 1,
      );
      const expectedControlId = hashCanonical({
        schemaVersion: 'synac-reviewed-control-id-v1',
        tagId: control.tagId,
        entryKey,
        polarity: control.label === 'applicable' ? 'positive' : 'negative',
        ruleId,
        senseKey,
        quote,
      });
      literal(controlId, expectedControlId, `${path}.controlId`);
    } else {
      fail(`${path}.evidenceKind`, 'unknown evidence kind');
    }
  });
  unique(controlIds, 'controls.controls[].controlId');
  unique(controlCells, 'controls.controls entry/tag cells');
  for (const [fileHash, binding] of reviewedBindings) {
    literal(
      reviewedCounts.get(fileHash) ?? 0,
      binding.rowCount,
      `controls.reviewedFiles/${fileHash}.rowCount`,
    );
  }
  const reports = array(root.perTag, 'controls.perTag');
  if (reports.length !== 11) fail('controls.perTag', 'must contain 11 reports');
  reports.forEach((reportValue, index) => {
    const report = record(reportValue, `controls.perTag[${index}]`);
    exactKeys(
      report,
      [
        'tagId',
        'positive',
        'negative',
        'positiveShortfall',
        'negativeShortfall',
        'eligible',
      ],
      `controls.perTag[${index}]`,
    );
    literal(report.tagId, TAG_IDS[index], `controls.perTag[${index}].tagId`);
    const positive = integer(
      report.positive,
      `controls.perTag[${index}].positive`,
      0,
      30,
    );
    const negative = integer(
      report.negative,
      `controls.perTag[${index}].negative`,
      0,
      30,
    );
    const actualPositive = controls.filter(
      (controlValue) =>
        (controlValue as Record<string, unknown>).tagId === TAG_IDS[index] &&
        (controlValue as Record<string, unknown>).label === 'applicable',
    ).length;
    const actualNegative = controls.filter(
      (controlValue) =>
        (controlValue as Record<string, unknown>).tagId === TAG_IDS[index] &&
        (controlValue as Record<string, unknown>).label === 'not_applicable',
    ).length;
    literal(positive, actualPositive, `controls.perTag[${index}].positive`);
    literal(negative, actualNegative, `controls.perTag[${index}].negative`);
    literal(
      report.positiveShortfall,
      30 - positive,
      `controls.perTag[${index}].positiveShortfall`,
    );
    literal(
      report.negativeShortfall,
      30 - negative,
      `controls.perTag[${index}].negativeShortfall`,
    );
    literal(
      report.eligible,
      positive === 30 && negative === 30,
      `controls.perTag[${index}].eligible`,
    );
    for (const [label, count] of [
      ['applicable', positive],
      ['not_applicable', negative],
    ] as const) {
      const stratum = controls.filter(
        (controlValue) =>
          (controlValue as Record<string, unknown>).tagId === TAG_IDS[index] &&
          (controlValue as Record<string, unknown>).label === label,
      );
      const calibration = stratum.filter(
        (controlValue) =>
          (controlValue as Record<string, unknown>).qualificationSplit ===
          'calibration',
      ).length;
      literal(
        calibration,
        Math.ceil(count / 2),
        `controls ${TAG_IDS[index]}/${label} calibration count`,
      );
    }
  });
  literal(
    root.protocolReady,
    reports.every(
      (item) => (item as Record<string, unknown>).eligible === true,
    ),
    'controls.protocolReady',
  );
  const expectedHash = hashCanonical({
    schemaVersion: root.schemaVersion,
    targetCount: root.targetCount,
    actualCount: root.actualCount,
    protocolReady: root.protocolReady,
    reviewedFiles: root.reviewedFiles,
    controls: root.controls,
    perTag: root.perTag,
  });
  if (root.controlHash !== expectedHash)
    fail('controls.controlHash', `expected ${expectedHash}`);
  return value as ControlSuite;
}

export function validateInjectionSuite(value: unknown): InjectionSuite {
  const root = record(value, 'injections');
  exactKeys(root, ['schemaVersion', 'packets', 'packetHash'], 'injections');
  literal(
    root.schemaVersion,
    'synac-injection-packets-v1',
    'injections.schemaVersion',
  );
  const packets = array(root.packets, 'injections.packets');
  if (packets.length !== 44)
    fail('injections.packets', 'must contain exactly 44 packets');
  const packetIds: string[] = [];
  packets.forEach((packetValue, index) => {
    const packet = record(packetValue, `injections.packets[${index}]`);
    exactKeys(
      packet,
      ['packetId', 'tagId', 'attackClass', 'untrustedText', 'expectedHandling'],
      `injections.packets[${index}]`,
    );
    packetIds.push(
      stringValue(packet.packetId, `injections.packets[${index}].packetId`),
    );
    if (!TAG_IDS.includes(packet.tagId as TagId))
      fail(`injections.packets[${index}].tagId`, 'unknown tag');
    if (
      ![
        'instruction',
        'label-solicitation',
        'fabricated-peer-verdict',
        'universal-scoring',
      ].includes(String(packet.attackClass))
    )
      fail(`injections.packets[${index}].attackClass`, 'unknown attack class');
    stringValue(
      packet.untrustedText,
      `injections.packets[${index}].untrustedText`,
    );
    const handling = record(
      packet.expectedHandling,
      `injections.packets[${index}].expectedHandling`,
    );
    exactKeys(
      handling,
      ['ignoreInstruction', 'injectionSuspected'],
      `injections.packets[${index}].expectedHandling`,
    );
    literal(
      handling.ignoreInstruction,
      true,
      `injections.packets[${index}].expectedHandling.ignoreInstruction`,
    );
    literal(
      handling.injectionSuspected,
      true,
      `injections.packets[${index}].expectedHandling.injectionSuspected`,
    );
  });
  unique(packetIds, 'injections.packets[].packetId');
  const expectedHash = hashCanonical({
    schemaVersion: root.schemaVersion,
    packets: root.packets,
  });
  if (root.packetHash !== expectedHash)
    fail('injections.packetHash', `expected ${expectedHash}`);
  return value as InjectionSuite;
}

function validateLane(value: unknown, index: number): ModelLane {
  const path = `models.lanes[${index}]`;
  const lane = record(value, path);
  exactKeys(
    lane,
    [
      'lane',
      'trainingOrganization',
      'baseModelFamily',
      'ancestry',
      'provider',
      'immutableModelId',
      'backendFingerprint',
      'openWeights',
      'weightsHash',
    ],
    path,
  );
  const expectedLanes = [
    'P1',
    'P2',
    'P3',
    'P4',
    'A1',
    'A2',
    'C+',
    'C-',
  ] as const;
  literal(lane.lane, expectedLanes[index], `${path}.lane`);
  for (const property of [
    'trainingOrganization',
    'baseModelFamily',
    'ancestry',
    'provider',
    'immutableModelId',
    'backendFingerprint',
  ] as const)
    stringValue(lane[property], `${path}.${property}`);
  const openWeights = booleanValue(lane.openWeights, `${path}.openWeights`);
  if (openWeights) sha(lane.weightsHash, `${path}.weightsHash`);
  else if (lane.weightsHash !== null)
    fail(`${path}.weightsHash`, 'must be null for closed weights');
  return value as ModelLane;
}

export function validateModelLineages(value: unknown): ModelLineages {
  const root = record(value, 'models');
  exactKeys(root, ['schemaVersion', 'lanes'], 'models');
  literal(
    root.schemaVersion,
    'synac-model-lineages-v1',
    'models.schemaVersion',
  );
  const laneValues = array(root.lanes, 'models.lanes');
  if (laneValues.length !== 8)
    fail('models.lanes', 'must contain P1-P4, A1-A2, C+, C- in order');
  const lanes = laneValues.map(validateLane);
  const direct = lanes.slice(0, 6);
  unique(
    direct.map((lane) => lane.baseModelFamily),
    'models direct-decision base families',
  );
  if (new Set(direct.map((lane) => lane.trainingOrganization)).size < 4)
    fail(
      'models.lanes',
      'direct lanes must span at least four training organizations',
    );
  if (!direct.some((lane) => lane.openWeights && lane.weightsHash !== null))
    fail(
      'models.lanes',
      'at least one direct lane must bind an open-weights hash',
    );
  const critics = lanes.slice(6);
  if (critics[0].baseModelFamily === critics[1].baseModelFamily)
    fail('models.lanes', 'critic families must be distinct');
  const arbiterFamilies = new Set(
    lanes.slice(4, 6).map((lane) => lane.baseModelFamily),
  );
  if (critics.some((lane) => arbiterFamilies.has(lane.baseModelFamily)))
    fail('models.lanes', 'critics must be distinct from arbiter families');
  return value as ModelLineages;
}

export function validateRuntimeConfig(value: unknown): RuntimeConfig {
  const root = record(value, 'runtime');
  exactKeys(
    root,
    [
      'schemaVersion',
      'runId',
      'frozenAt',
      'temperature',
      'seed',
      'tokenLimit',
      'tools',
      'candidates',
    ],
    'runtime',
  );
  literal(
    root.schemaVersion,
    'synac-runtime-config-v1',
    'runtime.schemaVersion',
  );
  stringValue(root.runId, 'runtime.runId');
  const frozenAt = stringValue(root.frozenAt, 'runtime.frozenAt');
  if (Number.isNaN(Date.parse(frozenAt)))
    fail('runtime.frozenAt', 'must be an ISO-8601 timestamp');
  literal(root.temperature, 0, 'runtime.temperature');
  integer(root.seed, 'runtime.seed', 0, 2_147_483_647);
  integer(root.tokenLimit, 'runtime.tokenLimit', 1, 1_000_000);
  literal(root.tools, false, 'runtime.tools');
  literal(root.candidates, 1, 'runtime.candidates');
  return value as RuntimeConfig;
}

export function validateManifest(value: unknown): RunManifest {
  const root = record(value, 'manifest');
  exactKeys(
    root,
    [
      'schemaVersion',
      'protocolVersion',
      'runId',
      'frozenAt',
      'entryCount',
      'tagIds',
      'hashes',
      'masterSeed',
      'controlsReady',
      'manifestHash',
    ],
    'manifest',
  );
  literal(
    root.schemaVersion,
    'synac-reference-manifest-v1',
    'manifest.schemaVersion',
  );
  literal(
    root.protocolVersion,
    'synac-ai-adjudication-v1',
    'manifest.protocolVersion',
  );
  stringValue(root.runId, 'manifest.runId');
  const frozenAt = stringValue(root.frozenAt, 'manifest.frozenAt');
  if (Number.isNaN(Date.parse(frozenAt)))
    fail('manifest.frozenAt', 'must be an ISO-8601 timestamp');
  literal(root.entryCount, 1500, 'manifest.entryCount');
  const tagIds = array(root.tagIds, 'manifest.tagIds');
  if (tagIds.length !== 11) fail('manifest.tagIds', 'must contain 11 tags');
  TAG_IDS.forEach((tagId, index) =>
    literal(tagIds[index], tagId, `manifest.tagIds[${index}]`),
  );
  const hashes = record(root.hashes, 'manifest.hashes');
  exactKeys(
    hashes,
    [
      'corpus',
      'rubric',
      'split',
      'controls',
      'injectionPackets',
      'code',
      'runtime',
      'models',
    ],
    'manifest.hashes',
  );
  for (const [name, valueHash] of Object.entries(hashes))
    sha(valueHash, `manifest.hashes.${name}`);
  sha(root.masterSeed, 'manifest.masterSeed');
  booleanValue(root.controlsReady, 'manifest.controlsReady');
  const expectedHash = hashCanonical({
    schemaVersion: root.schemaVersion,
    protocolVersion: root.protocolVersion,
    runId: root.runId,
    frozenAt: root.frozenAt,
    entryCount: root.entryCount,
    tagIds: root.tagIds,
    hashes: root.hashes,
    masterSeed: root.masterSeed,
    controlsReady: root.controlsReady,
  });
  if (root.manifestHash !== expectedHash)
    fail('manifest.manifestHash', `expected ${expectedHash}`);
  return value as RunManifest;
}

function evidenceText(
  entry: ClassificationEntry,
  field: unknown,
  senseKey: unknown,
  path: string,
): string {
  if (field === 'title') {
    if (senseKey !== null) fail(`${path}.senseKey`, 'must be null for title');
    return entry.title;
  }
  if (field === 'summaryText') {
    if (senseKey !== null)
      fail(`${path}.senseKey`, 'must be null for summaryText');
    if (entry.summaryText === null) fail(path, 'entry has no summaryText');
    return entry.summaryText;
  }
  if (field === 'definition') {
    const key = stringValue(senseKey, `${path}.senseKey`);
    const sense = entry.senses.find((candidate) => candidate.key === key);
    if (!sense) fail(`${path}.senseKey`, 'does not identify an entry sense');
    return sense.definitionText;
  }
  return fail(`${path}.field`, 'must be title, summaryText, or definition');
}

export function validateClassificationResponse(
  value: unknown,
  expected: Readonly<{
    entry: ClassificationEntry;
    entryHash: string;
    rubric: FrozenRubric;
    rubricHash: string;
    sealId: string;
  }>,
): ClassificationResponse {
  const root = record(value, 'response');
  exactKeys(
    root,
    [
      'entry_hash',
      'rubric_hash',
      'seal_id',
      'injection_suspected',
      'decisions',
    ],
    'response',
  );
  literal(root.entry_hash, expected.entryHash, 'response.entry_hash');
  literal(root.rubric_hash, expected.rubricHash, 'response.rubric_hash');
  if (root.seal_id !== expected.sealId)
    fail('response.seal_id', `foreign seal; expected ${expected.sealId}`);
  stringValue(root.seal_id, 'response.seal_id');
  booleanValue(root.injection_suspected, 'response.injection_suspected');
  const knownRuleIds = new Set([
    ...expected.rubric.globalRules.map((rule) => rule.id),
    ...expected.rubric.tags.flatMap((tag) =>
      [...tag.inclusionRules, ...tag.exclusionRules].map((rule) => rule.id),
    ),
  ]);
  const decisions = array(root.decisions, 'response.decisions');
  if (decisions.length !== 11)
    fail('response.decisions', 'must contain exactly 11 decisions');
  const decisionTags: string[] = [];
  decisions.forEach((decisionValue, index) => {
    const path = `response.decisions[${index}]`;
    const decision = record(decisionValue, path);
    exactKeys(
      decision,
      [
        'tag_id',
        'verdict',
        'p_applicable',
        'rule_ids',
        'evidence',
        'counterevidence',
      ],
      path,
    );
    const tagId = stringValue(decision.tag_id, `${path}.tag_id`);
    if (!TAG_IDS.includes(tagId as TagId))
      fail(`${path}.tag_id`, 'unknown tag');
    decisionTags.push(tagId);
    if (!['yes', 'no', 'abstain'].includes(String(decision.verdict)))
      fail(`${path}.verdict`, 'unknown verdict');
    integer(decision.p_applicable, `${path}.p_applicable`, 0, 100);
    const citedRules = array(decision.rule_ids, `${path}.rule_ids`).map(
      (rule, ruleIndex) => stringValue(rule, `${path}.rule_ids[${ruleIndex}]`),
    );
    unique(citedRules, `${path}.rule_ids`);
    for (const ruleId of citedRules)
      if (!knownRuleIds.has(ruleId))
        fail(`${path}.rule_ids`, `unknown rule ${ruleId}`);
    const evidence = array(decision.evidence, `${path}.evidence`);
    if (decision.verdict === 'yes' && evidence.length === 0)
      fail(`${path}.evidence`, 'yes verdict requires evidence');
    evidence.forEach((spanValue, spanIndex) => {
      const spanPath = `${path}.evidence[${spanIndex}]`;
      const span = record(spanValue, spanPath);
      exactKeys(span, ['field', 'senseKey', 'start', 'end'], spanPath);
      const text = evidenceText(
        expected.entry,
        span.field,
        span.senseKey,
        spanPath,
      );
      const bytes = Buffer.from(text, 'utf8');
      const start = integer(span.start, `${spanPath}.start`, 0, bytes.length);
      const end = integer(span.end, `${spanPath}.end`, start + 1, bytes.length);
      const selected = bytes.subarray(start, end);
      if (!Buffer.from(selected.toString('utf8'), 'utf8').equals(selected))
        fail(spanPath, 'offsets must align to UTF-8 code-point boundaries');
    });
    const counterevidence =
      typeof decision.counterevidence === 'string'
        ? decision.counterevidence
        : fail(`${path}.counterevidence`, 'must be a string');
    if (counterevidence.trim().split(/\s+/).filter(Boolean).length > 60)
      fail(`${path}.counterevidence`, 'must be at most 60 words');
  });
  unique(decisionTags, 'response.decisions[].tag_id');
  return value as ClassificationResponse;
}
