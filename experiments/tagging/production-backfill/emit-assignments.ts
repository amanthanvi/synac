import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compileContent } from '../../../tools/content/src/compile.js';
import { loadContentDir } from '../../../tools/content/src/load.js';
import {
  tagAssignmentsFileSchema,
  type TagAssignmentsFile,
  type TagsFile,
} from '../../../tools/content/src/model.js';
import {
  classificationCorpusHash,
  classificationEntryHash,
  stableJsonHash,
  tagTaxonomyHash,
} from '../../../tools/content/src/tagging.js';
import { compileClassificationEntries } from '../synthetic-reference/corpus.js';
import { loadReviewedControls } from '../synthetic-reference/reviewed-controls.js';
import { FROZEN_RUBRIC } from '../synthetic-reference/rubric.js';

const MINIMUM_COVERAGE = 0.3;
const MINIMUM_PER_TAG = 25;
const LOCAL_CONFIDENCE = 90;
const TERRA_CONFIDENCE = 98;

type JsonRecord = Record<string, unknown>;

export type CorpusEntry = {
  entryKey: string;
  entryContentHash: string;
  evidenceSenseKeys: string[];
};

export type CurrentCorpus = {
  contentVersion: string;
  corpusHash: string;
  entries: CorpusEntry[];
};

export type HashedArtifact = {
  value: unknown;
  artifactHash: string;
};

export type BuildEmissionInput = {
  reviewed: HashedArtifact;
  productionManifest: HashedArtifact;
  entryIndex: HashedArtifact;
  rubric: HashedArtifact;
  tags: TagsFile;
  corpus: CurrentCorpus;
  runId: string;
  createdAt: string;
  previous?: HashedArtifact;
  removals?: HashedArtifact;
  sourceControls?: SourceControlSuite;
};

export type SourceControlCandidate = {
  entryKey: string;
  entryContentHash: string;
  tagSlug: string;
  ruleId: string;
  senseKey: string;
  primaryReviewer: string;
  secondaryReviewer: string;
};

export type SourceControlSuite = {
  artifactHash: string;
  files: Array<{
    tagSlug: string;
    fileHash: string;
    rowCount: number;
  }>;
  positives: SourceControlCandidate[];
};

export type FileOperations = {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
};

export type WriteEmissionInput = {
  outputPath: string;
  reportPath: string;
  replace: boolean;
  artifact: TagAssignmentsFile;
  report: JsonRecord;
  files?: FileOperations;
};

type Contract = {
  slug: string;
  inclusionRules: string[];
  exclusionRules: string[];
};

type ValidatedRubric = {
  taxonomyVersion: string;
  benchmarkHash: string;
  rubricHash: string;
  contracts: Contract[];
};

type ProductionManifest = {
  model: 'gpt-5.6-terra';
  reasoningEffort: 'max';
  passes: ['a', 'b'];
  entryCount: number;
  contentVersion: string;
  corpusHash: string;
  entryIndexHash: string;
  rubricHash: string;
  promptHash: string;
  configHash: string;
  requestFileHash: string;
};

type AcceptedCandidate = {
  entryKey: string;
  entryContentHash: string;
  tagSlug: string;
  score: number;
  graniteConfidence: number;
  gemmaConfidence: number;
};

type ValidatedReview = {
  reviewManifestHash: string;
  sourceCandidatesHash: string;
  roles: unknown;
  ollama: unknown;
  accepted: AcceptedCandidate[];
};

const expectedLocalRoles = [
  {
    id: 'granite-inclusion',
    model: 'granite3.3:8b',
    order: 'normal',
  },
  {
    id: 'gemma-exclusion',
    model: 'gemma3:12b',
    order: 'reverse',
  },
] as const;

type ReviewedRemoval = {
  entryKey: string;
  tagSlug: string;
  previousEntryContentHash: string;
  currentEntryContentHash: string;
  reason: string;
  runId: string;
};

type ValidatedRemovals = {
  removals: ReviewedRemoval[];
  artifactHash: string | null;
};

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function unique(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requiredSha(value: unknown, label: string): string {
  const result = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return result;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function pairKey(value: { entryKey: string; tagSlug: string }): string {
  return `${value.entryKey}\0${value.tagSlug}`;
}

function sortPairs<T extends { entryKey: string; tagSlug: string }>(
  values: T[],
): T[] {
  return values.sort(
    (left, right) =>
      left.entryKey.localeCompare(right.entryKey) ||
      left.tagSlug.localeCompare(right.tagSlug),
  );
}

function publishedTags(tags: TagsFile): string[] {
  if (tags.taxonomyVersion !== '2') {
    throw new Error(
      `expected taxonomy version 2, got ${tags.taxonomyVersion ?? 'missing'}`,
    );
  }
  const slugs = tags.tags
    .filter((tag) => (tag.lifecycle ?? 'PUBLISHED') === 'PUBLISHED')
    .map((tag) => tag.slug)
    .sort((left, right) => left.localeCompare(right));
  if (!unique(slugs)) throw new Error('published tags contain duplicate slugs');
  return slugs;
}

function validateRubric(
  artifact: HashedArtifact,
  production: ProductionManifest,
  publishedTagSlugs: readonly string[],
): ValidatedRubric {
  const value = artifact.value;
  if (!isRecord(value) || !Array.isArray(value.contracts)) {
    throw new Error('rubric input has an invalid schema');
  }
  const taxonomyVersion = String(value.taxonomyVersion);
  if (taxonomyVersion !== '2')
    throw new Error('rubric taxonomy version must be 2');
  if (!stringArray(value.globalRules))
    throw new Error('rubric globalRules must be an array');
  const contracts = value.contracts.map((raw, index): Contract => {
    if (!isRecord(raw))
      throw new Error(`rubric contract ${index} must be an object`);
    const slug = requiredString(raw.slug, `rubric contract ${index} slug`);
    if (!stringArray(raw.inclusionRules) || raw.inclusionRules.length === 0) {
      throw new Error(`rubric contract ${slug} has no inclusion rules`);
    }
    if (!stringArray(raw.exclusionRules) || raw.exclusionRules.length === 0) {
      throw new Error(`rubric contract ${slug} has no exclusion rules`);
    }
    return {
      slug,
      inclusionRules: raw.inclusionRules,
      exclusionRules: raw.exclusionRules,
    };
  });
  if (
    contracts.length !== 11 ||
    !unique(contracts.map((contract) => contract.slug))
  ) {
    throw new Error('rubric must contain 11 unique tag contracts');
  }
  const contractSlugs = contracts.map((contract) => contract.slug).sort();
  if (JSON.stringify(contractSlugs) !== JSON.stringify(publishedTagSlugs)) {
    throw new Error('rubric contracts do not match current published tags');
  }
  const rubricPacket = {
    taxonomyVersion: value.taxonomyVersion,
    globalRules: value.globalRules,
    contracts: value.contracts,
  };
  const rubricHash = hashJson(rubricPacket);
  if (rubricHash !== production.rubricHash) {
    throw new Error('rubric hash drift from production manifest');
  }
  return {
    taxonomyVersion,
    benchmarkHash: requiredSha(value.benchmarkHash, 'rubric benchmarkHash'),
    rubricHash,
    contracts,
  };
}

function validateProductionManifest(
  artifact: HashedArtifact,
): ProductionManifest {
  const value = artifact.value;
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'synac-production-backfill-manifest-v1'
  ) {
    throw new Error('production manifest has an unsupported schema');
  }
  if (artifact.artifactHash !== hashJson(value)) {
    throw new Error('production manifest artifact hash mismatch');
  }
  if (value.model !== 'gpt-5.6-terra' || value.reasoningEffort !== 'max') {
    throw new Error('production manifest is not Terra max');
  }
  if (
    !Array.isArray(value.passes) ||
    value.passes.length !== 2 ||
    value.passes[0] !== 'a' ||
    value.passes[1] !== 'b'
  ) {
    throw new Error('production manifest must use the two fixed mirror passes');
  }
  if (
    typeof value.entryCount !== 'number' ||
    !Number.isInteger(value.entryCount) ||
    value.entryCount < 0
  ) {
    throw new Error('production manifest entryCount is invalid');
  }
  return {
    model: value.model,
    reasoningEffort: value.reasoningEffort,
    passes: ['a', 'b'],
    entryCount: value.entryCount,
    contentVersion: requiredSha(
      value.contentVersion,
      'manifest contentVersion',
    ),
    corpusHash: requiredSha(value.corpusHash, 'manifest corpusHash'),
    entryIndexHash: requiredSha(
      value.entryIndexHash,
      'manifest entryIndexHash',
    ),
    rubricHash: requiredSha(value.rubricHash, 'manifest rubricHash'),
    promptHash: requiredSha(value.promptHash, 'manifest promptHash'),
    configHash: requiredSha(value.configHash, 'manifest configHash'),
    requestFileHash: requiredSha(
      value.requestFileHash,
      'manifest requestFileHash',
    ),
  };
}

function validateEntryIndex(
  artifact: HashedArtifact,
  production: ProductionManifest,
  corpus: CurrentCorpus,
): void {
  if (artifact.artifactHash !== hashJson(artifact.value)) {
    throw new Error('entry index artifact hash mismatch');
  }
  if (artifact.artifactHash !== production.entryIndexHash) {
    throw new Error('entry index drift from production manifest');
  }
  const value = artifact.value;
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error('entry index has an invalid schema');
  }
  if (value.contentVersion !== corpus.contentVersion) {
    throw new Error('entry index content version drift');
  }
  const indexed = new Map<string, string>();
  for (const raw of value.entries) {
    if (!isRecord(raw)) throw new Error('entry index row must be an object');
    const entryKey = requiredString(raw.entryKey, 'entry index entryKey');
    const entryContentHash = requiredSha(
      raw.entryContentHash,
      `${entryKey} index hash`,
    );
    if (indexed.has(entryKey))
      throw new Error(`duplicate entry index row ${entryKey}`);
    indexed.set(entryKey, entryContentHash);
  }
  if (indexed.size !== corpus.entries.length) {
    throw new Error('entry index count drift from current corpus');
  }
  for (const entry of corpus.entries) {
    if (indexed.get(entry.entryKey) !== entry.entryContentHash) {
      throw new Error(`entry index hash drift for ${entry.entryKey}`);
    }
  }
}

function validRuleId(ruleId: string, contract: Contract): boolean {
  if (ruleId === 'global:substantive-topic') return true;
  const match = /^(include|exclude):(\d+)$/.exec(ruleId);
  if (!match) return false;
  const ruleIndex = Number(match[2]);
  const length =
    match[1] === 'include'
      ? contract.inclusionRules.length
      : contract.exclusionRules.length;
  return ruleIndex >= 1 && ruleIndex <= length;
}

function validateSupportingReview(
  value: unknown,
  label: string,
  entry: CorpusEntry,
  contract: Contract,
): number {
  if (!isRecord(value)) throw new Error(`${label} review is missing`);
  if (value.verdict !== 'SUPPORT') throw new Error(`${label} did not SUPPORT`);
  if (
    typeof value.confidence !== 'number' ||
    !Number.isInteger(value.confidence) ||
    value.confidence < LOCAL_CONFIDENCE ||
    value.confidence > 100
  ) {
    throw new Error(
      `${label} confidence is below ${LOCAL_CONFIDENCE} or invalid`,
    );
  }
  if (value.injectionSuspected !== false) {
    throw new Error(`${label} suspected injection`);
  }
  if (value.validResponse !== true)
    throw new Error(`${label} response was invalid`);
  if (
    !stringArray(value.ruleIds) ||
    value.ruleIds.length === 0 ||
    !unique(value.ruleIds)
  ) {
    throw new Error(`${label} rule IDs are invalid`);
  }
  if (!value.ruleIds.some((ruleId) => ruleId.startsWith('include:'))) {
    throw new Error(`${label} SUPPORT lacks an inclusion rule`);
  }
  for (const ruleId of value.ruleIds) {
    if (!validRuleId(ruleId, contract))
      throw new Error(`${label} has invalid rule ${ruleId}`);
  }
  if (
    !stringArray(value.evidenceSenseKeys) ||
    value.evidenceSenseKeys.length === 0 ||
    !unique(value.evidenceSenseKeys)
  ) {
    throw new Error(`${label} evidence is invalid`);
  }
  const senses = new Set(entry.evidenceSenseKeys);
  for (const senseKey of value.evidenceSenseKeys) {
    if (!senses.has(senseKey))
      throw new Error(`${label} has stale evidence ${senseKey}`);
  }
  return value.confidence;
}

function validateReviewed(
  artifact: HashedArtifact,
  productionArtifactHash: string,
  production: ProductionManifest,
  rubric: ValidatedRubric,
  corpus: CurrentCorpus,
): ValidatedReview {
  const value = artifact.value;
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'synac-reviewed-production-candidates-v1'
  ) {
    throw new Error('reviewed candidates have an unsupported schema');
  }
  if (!isRecord(value.source))
    throw new Error('reviewed candidates source is missing');
  const expectedSources: Array<[string, string]> = [
    ['productionManifestHash', productionArtifactHash],
    ['contentVersion', corpus.contentVersion],
    ['corpusHash', corpus.corpusHash],
    ['entryIndexHash', production.entryIndexHash],
    ['rubricHash', production.rubricHash],
  ];
  for (const [field, expected] of expectedSources) {
    if (value.source[field] !== expected) {
      throw new Error(`reviewed candidates ${field} drift`);
    }
  }
  const reviewManifestHash = requiredSha(
    value.reviewManifestHash,
    'reviewed candidates reviewManifestHash',
  );
  const sourceCandidatesHash = requiredSha(
    value.source.candidatesHash,
    'reviewed candidates source candidatesHash',
  );
  if (
    !Array.isArray(value.roles) ||
    value.roles.length !== expectedLocalRoles.length
  ) {
    throw new Error(
      'reviewed candidates do not contain the two fixed local roles',
    );
  }
  for (let index = 0; index < expectedLocalRoles.length; index += 1) {
    const actual = value.roles[index];
    const expected = expectedLocalRoles[index];
    if (
      !isRecord(actual) ||
      actual.id !== expected.id ||
      actual.model !== expected.model ||
      actual.order !== expected.order
    ) {
      throw new Error(`reviewed candidates local role ${index} drift`);
    }
    requiredSha(actual.promptHash, `${expected.id} promptHash`);
  }
  if (!isRecord(value.ollama) || !Array.isArray(value.ollama.models)) {
    throw new Error('reviewed candidates Ollama binding is missing');
  }
  for (const expected of expectedLocalRoles) {
    const model = value.ollama.models.find(
      (candidate) =>
        isRecord(candidate) && candidate.requestedModel === expected.model,
    );
    if (!isRecord(model))
      throw new Error(
        `reviewed candidates omit Ollama model ${expected.model}`,
      );
    requiredSha(model.digest, `${expected.model} Ollama digest`);
  }
  if (
    !Array.isArray(value.accepted) ||
    !Array.isArray(value.review) ||
    !Array.isArray(value.abstain)
  ) {
    throw new Error('reviewed candidate buckets are invalid');
  }
  if (
    value.acceptedCandidateCount !== value.accepted.length ||
    value.reviewCount !== value.review.length ||
    value.abstainCount !== value.abstain.length ||
    value.candidateCount !==
      value.accepted.length + value.review.length + value.abstain.length
  ) {
    throw new Error('reviewed candidate counts do not match buckets');
  }
  const corpusByKey = new Map(
    corpus.entries.map((entry) => [entry.entryKey, entry]),
  );
  const contracts = new Map(
    rubric.contracts.map((contract) => [contract.slug, contract]),
  );
  const seen = new Set<string>();
  for (const [bucketName, rows] of [
    ['accepted', value.accepted],
    ['review', value.review],
    ['abstain', value.abstain],
  ] as const) {
    for (const raw of rows) {
      if (!isRecord(raw))
        throw new Error(`${bucketName} candidate must be an object`);
      const entryKey = requiredString(raw.entryKey, `${bucketName} entryKey`);
      const tagSlug = requiredString(raw.tagSlug, `${bucketName} tagSlug`);
      const identity = pairKey({ entryKey, tagSlug });
      if (seen.has(identity))
        throw new Error(`duplicate reviewed pair ${entryKey}/${tagSlug}`);
      seen.add(identity);
      const entry = corpusByKey.get(entryKey);
      if (!entry || raw.entryContentHash !== entry.entryContentHash) {
        throw new Error(`${bucketName} pair ${entryKey}/${tagSlug} is stale`);
      }
      if (!contracts.has(tagSlug)) {
        throw new Error(
          `${bucketName} pair ${entryKey}/${tagSlug} uses an unknown tag`,
        );
      }
    }
  }
  const accepted = value.accepted.map((raw): AcceptedCandidate => {
    if (!isRecord(raw) || !isRecord(raw.reviews)) {
      throw new Error('accepted candidate reviews are missing');
    }
    const entryKey = requiredString(raw.entryKey, 'accepted entryKey');
    const tagSlug = requiredString(raw.tagSlug, 'accepted tagSlug');
    const entry = corpusByKey.get(entryKey);
    const contract = contracts.get(tagSlug);
    if (!entry || !contract)
      throw new Error(`accepted pair ${entryKey}/${tagSlug} is invalid`);
    if (
      typeof raw.score !== 'number' ||
      !Number.isFinite(raw.score) ||
      raw.score < 0 ||
      raw.score > 1
    ) {
      throw new Error(
        `accepted pair ${entryKey}/${tagSlug} has an invalid Terra score`,
      );
    }
    if (raw.score < TERRA_CONFIDENCE / 100) {
      throw new Error(
        `accepted pair ${entryKey}/${tagSlug} is below Terra AUTO threshold`,
      );
    }
    const graniteConfidence = validateSupportingReview(
      raw.reviews.graniteInclusion,
      `${entryKey}/${tagSlug} Granite`,
      entry,
      contract,
    );
    const gemmaConfidence = validateSupportingReview(
      raw.reviews.gemmaExclusion,
      `${entryKey}/${tagSlug} Gemma`,
      entry,
      contract,
    );
    return {
      entryKey,
      entryContentHash: entry.entryContentHash,
      tagSlug,
      score: raw.score,
      graniteConfidence,
      gemmaConfidence,
    };
  });
  return {
    reviewManifestHash,
    sourceCandidatesHash,
    roles: value.roles,
    ollama: value.ollama,
    accepted,
  };
}

function validatePrevious(
  artifact: HashedArtifact | undefined,
  taxonomyHash: string,
): {
  value?: TagAssignmentsFile;
  artifactHash: string | null;
  assignmentsHash: string | null;
} {
  if (!artifact) return { artifactHash: null, assignmentsHash: null };
  requiredSha(artifact.artifactHash, 'predecessor artifact hash');
  const parsed = tagAssignmentsFileSchema.safeParse(artifact.value);
  if (!parsed.success)
    throw new Error(
      `predecessor assignment artifact is invalid: ${parsed.error.message}`,
    );
  if (
    parsed.data.taxonomyVersion !== '2' ||
    parsed.data.taxonomyHash !== taxonomyHash
  ) {
    throw new Error('predecessor taxonomy drift');
  }
  const seen = new Set<string>();
  for (const row of parsed.data.assignments) {
    const identity = pairKey(row);
    if (seen.has(identity))
      throw new Error(
        `predecessor has duplicate pair ${row.entryKey}/${row.tagSlug}`,
      );
    seen.add(identity);
    if (row.runId !== parsed.data.run.runId) {
      throw new Error(
        `predecessor pair ${row.entryKey}/${row.tagSlug} has a foreign run ID`,
      );
    }
    if (row.authority !== 'SYNTHETIC_REFERENCE' || row.lane !== 'AUTO') {
      throw new Error(
        `predecessor pair ${row.entryKey}/${row.tagSlug} is not synthetic AUTO`,
      );
    }
  }
  return {
    value: parsed.data,
    artifactHash: artifact.artifactHash,
    assignmentsHash: stableJsonHash(parsed.data),
  };
}

function validateRemovals(
  artifact: HashedArtifact | undefined,
  predecessorHash: string | null,
  reviewedCandidatesHash: string,
  runId: string,
): ValidatedRemovals {
  if (!artifact) return { removals: [], artifactHash: null };
  if (!predecessorHash)
    throw new Error('reviewed removals require a predecessor artifact');
  const value = artifact.value;
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'predecessorHash',
      'reviewedCandidatesHash',
      'removals',
    ]) ||
    value.schemaVersion !== 'synac-reviewed-tag-removals-v1' ||
    value.predecessorHash !== predecessorHash ||
    value.reviewedCandidatesHash !== reviewedCandidatesHash ||
    !Array.isArray(value.removals)
  ) {
    throw new Error(
      'reviewed removals are not bound to this predecessor and review artifact',
    );
  }
  const seen = new Set<string>();
  const removals = value.removals.map((raw, index): ReviewedRemoval => {
    if (
      !isRecord(raw) ||
      !exactKeys(raw, [
        'entryKey',
        'tagSlug',
        'previousEntryContentHash',
        'currentEntryContentHash',
        'reason',
        'runId',
      ])
    ) {
      throw new Error(`reviewed removal ${index} has an invalid schema`);
    }
    const removal = {
      entryKey: requiredString(raw.entryKey, `removal ${index} entryKey`),
      tagSlug: requiredString(raw.tagSlug, `removal ${index} tagSlug`),
      previousEntryContentHash: requiredSha(
        raw.previousEntryContentHash,
        `removal ${index} previousEntryContentHash`,
      ),
      currentEntryContentHash: requiredSha(
        raw.currentEntryContentHash,
        `removal ${index} currentEntryContentHash`,
      ),
      reason: requiredString(raw.reason, `removal ${index} reason`),
      runId: requiredString(raw.runId, `removal ${index} runId`),
    };
    if (removal.runId !== runId)
      throw new Error(`removal ${index} has a foreign run ID`);
    const identity = pairKey(removal);
    if (seen.has(identity))
      throw new Error(
        `duplicate reviewed removal ${removal.entryKey}/${removal.tagSlug}`,
      );
    seen.add(identity);
    return removal;
  });
  return { removals, artifactHash: artifact.artifactHash };
}

function releaseFloors(
  assignments: readonly TagAssignmentsFile['assignments'][number][],
  corpusSize: number,
  publishedTagSlugs: readonly string[],
): { uniqueEntryCount: number; coverage: number; perTag: Map<string, number> } {
  const uniqueEntryCount = new Set(assignments.map((row) => row.entryKey)).size;
  const coverage = corpusSize === 0 ? 0 : uniqueEntryCount / corpusSize;
  if (coverage < MINIMUM_COVERAGE) {
    throw new Error(
      `assignment coverage ${(coverage * 100).toFixed(2)}% is below required ${(MINIMUM_COVERAGE * 100).toFixed(2)}%`,
    );
  }
  const perTag = new Map(publishedTagSlugs.map((tagSlug) => [tagSlug, 0]));
  for (const row of assignments) {
    perTag.set(row.tagSlug, (perTag.get(row.tagSlug) ?? 0) + 1);
  }
  for (const tagSlug of publishedTagSlugs) {
    const count = perTag.get(tagSlug) ?? 0;
    if (count < MINIMUM_PER_TAG) {
      throw new Error(
        `${tagSlug} has ${count} assignments; at least ${MINIMUM_PER_TAG} required`,
      );
    }
  }
  return { uniqueEntryCount, coverage, perTag };
}

export function buildAssignmentEmission(input: BuildEmissionInput): {
  artifact: TagAssignmentsFile;
  report: JsonRecord;
} {
  const production = validateProductionManifest(input.productionManifest);
  if (
    production.entryCount !== input.corpus.entries.length ||
    production.contentVersion !== input.corpus.contentVersion ||
    production.corpusHash !== input.corpus.corpusHash
  ) {
    throw new Error('current compiled corpus drift from production manifest');
  }
  const publishedTagSlugs = publishedTags(input.tags);
  const taxonomyHash = tagTaxonomyHash(input.tags);
  const rubric = validateRubric(input.rubric, production, publishedTagSlugs);
  validateEntryIndex(input.entryIndex, production, input.corpus);
  const reviewed = validateReviewed(
    input.reviewed,
    input.productionManifest.artifactHash,
    production,
    rubric,
    input.corpus,
  );
  const previous = validatePrevious(input.previous, taxonomyHash);
  const reviewedRemovals = validateRemovals(
    input.removals,
    previous.artifactHash,
    input.reviewed.artifactHash,
    input.runId,
  );
  const corpusByKey = new Map(
    input.corpus.entries.map((entry) => [entry.entryKey, entry]),
  );
  const published = new Set(publishedTagSlugs);
  const assignmentsByPair = new Map<
    string,
    TagAssignmentsFile['assignments'][number]
  >();
  for (const accepted of reviewed.accepted) {
    const identity = pairKey(accepted);
    if (assignmentsByPair.has(identity)) {
      throw new Error(
        `duplicate accepted pair ${accepted.entryKey}/${accepted.tagSlug}`,
      );
    }
    if (!published.has(accepted.tagSlug)) {
      throw new Error(
        `accepted pair references non-published tag ${accepted.tagSlug}`,
      );
    }
    assignmentsByPair.set(identity, {
      entryKey: accepted.entryKey,
      entryContentHash: accepted.entryContentHash,
      tagSlug: accepted.tagSlug,
      authority: 'SYNTHETIC_REFERENCE',
      lane: 'AUTO',
      score: accepted.score,
      runId: input.runId,
    });
  }
  const sourceControlPairs = new Set<string>();
  for (const control of input.sourceControls?.positives ?? []) {
    const identity = pairKey(control);
    if (sourceControlPairs.has(identity)) {
      throw new Error(
        `duplicate source control ${control.entryKey}/${control.tagSlug}`,
      );
    }
    sourceControlPairs.add(identity);
    const entry = corpusByKey.get(control.entryKey);
    if (!entry || entry.entryContentHash !== control.entryContentHash) {
      throw new Error(
        `source control ${control.entryKey}/${control.tagSlug} has stale serving evidence`,
      );
    }
    if (!published.has(control.tagSlug)) {
      throw new Error(
        `source control references non-published tag ${control.tagSlug}`,
      );
    }
    if (!entry.evidenceSenseKeys.includes(control.senseKey)) {
      throw new Error(
        `source control ${control.entryKey}/${control.tagSlug} has stale sense ${control.senseKey}`,
      );
    }
    if (
      control.primaryReviewer.length === 0 ||
      control.secondaryReviewer.length === 0 ||
      control.primaryReviewer === control.secondaryReviewer
    ) {
      throw new Error(
        `source control ${control.entryKey}/${control.tagSlug} has invalid reviewers`,
      );
    }
    if (!assignmentsByPair.has(identity)) {
      assignmentsByPair.set(identity, {
        entryKey: control.entryKey,
        entryContentHash: control.entryContentHash,
        tagSlug: control.tagSlug,
        authority: 'SYNTHETIC_REFERENCE',
        lane: 'AUTO',
        score: 1,
        runId: input.runId,
      });
    }
  }
  const removalsByPair = new Map(
    reviewedRemovals.removals.map((row) => [pairKey(row), row]),
  );
  const previousByPair = new Map(
    (previous.value?.assignments ?? []).map((row) => [pairKey(row), row]),
  );
  for (const [identity, removal] of removalsByPair) {
    const prior = previousByPair.get(identity);
    if (!prior)
      throw new Error(
        `reviewed removal has no predecessor pair ${removal.entryKey}/${removal.tagSlug}`,
      );
    if (assignmentsByPair.has(identity)) {
      throw new Error(
        `pair ${removal.entryKey}/${removal.tagSlug} is both accepted and removed`,
      );
    }
  }
  for (const [identity, prior] of previousByPair) {
    const fresh = assignmentsByPair.get(identity);
    if (fresh) continue;
    const currentEntry = corpusByKey.get(prior.entryKey);
    const removal = removalsByPair.get(identity);
    if (removal) {
      if (removal.previousEntryContentHash !== prior.entryContentHash) {
        throw new Error(
          `reviewed removal prior hash mismatch for ${prior.entryKey}/${prior.tagSlug}`,
        );
      }
      if (
        !currentEntry ||
        removal.currentEntryContentHash !== currentEntry.entryContentHash
      ) {
        throw new Error(
          `reviewed removal is not classified against current ${prior.entryKey}`,
        );
      }
      continue;
    }
    if (
      !currentEntry ||
      currentEntry.entryContentHash !== prior.entryContentHash
    ) {
      throw new Error(
        `stale predecessor pair ${prior.entryKey}/${prior.tagSlug} requires fresh classification`,
      );
    }
    if (!published.has(prior.tagSlug)) {
      throw new Error(
        `predecessor tag ${prior.tagSlug} is no longer published and requires reviewed removal`,
      );
    }
    assignmentsByPair.set(identity, {
      ...prior,
      entryContentHash: currentEntry.entryContentHash,
      runId: input.runId,
    });
  }
  const assignments = sortPairs([...assignmentsByPair.values()]);
  if (!unique(assignments.map(pairKey)))
    throw new Error('emission contains duplicate pairs');
  const floor = releaseFloors(
    assignments,
    input.corpus.entries.length,
    publishedTagSlugs,
  );

  const modelBinding = {
    schemaVersion: 'synac-production-tagging-model-binding-v1',
    terra: {
      model: production.model,
      reasoningEffort: production.reasoningEffort,
      passes: production.passes,
    },
    localReviewers: reviewed.roles,
    ollama: reviewed.ollama,
    sourceControls: input.sourceControls
      ? {
          artifactHash: input.sourceControls.artifactHash,
          files: input.sourceControls.files,
        }
      : null,
  };
  const configBinding = {
    schemaVersion: 'synac-production-tagging-config-binding-v1',
    productionConfigHash: production.configHash,
    productionRequestFileHash: production.requestFileHash,
    localReviewManifestHash: reviewed.reviewManifestHash,
    reviewedCandidatesHash: input.reviewed.artifactHash,
    sourceControlsHash: input.sourceControls?.artifactHash ?? null,
    emitter: {
      assignmentSchemaVersion: 1,
      authority: 'SYNTHETIC_REFERENCE',
      lane: 'AUTO',
      score:
        'Terra mirrored AUTO confidence; local reviewers are hard certification gates',
    },
  };
  const calibrationBinding = {
    schemaVersion: 'synac-production-tagging-calibration-binding-v1',
    labelOrigin: 'synthetic_ai_panel',
    benchmarkHash: rubric.benchmarkHash,
    rubricArtifactHash: input.rubric.artifactHash,
    rubricHash: rubric.rubricHash,
    terraCandidatesHash: reviewed.sourceCandidatesHash,
    reviewedCandidatesHash: input.reviewed.artifactHash,
    localReviewManifestHash: reviewed.reviewManifestHash,
    sourceControlsHash: input.sourceControls?.artifactHash ?? null,
  };
  const thresholdsBinding = {
    schemaVersion: 'synac-production-tagging-thresholds-v1',
    terra: { lane: 'AUTO', minimumConfidence: TERRA_CONFIDENCE },
    localReview: {
      requiredRoles: ['granite-inclusion', 'gemma-exclusion'],
      verdict: 'SUPPORT',
      minimumConfidence: LOCAL_CONFIDENCE,
      evidenceRequired: true,
      injectionSuspected: false,
    },
    release: {
      minimumUniqueEntryCoverage: MINIMUM_COVERAGE,
      minimumAssignmentsPerPublishedTag: MINIMUM_PER_TAG,
    },
  };
  const thresholds = Object.fromEntries(
    publishedTagSlugs.map((tagSlug) => [tagSlug, TERRA_CONFIDENCE / 100]),
  );
  for (const row of assignments) {
    if (row.score < thresholds[row.tagSlug]) {
      throw new Error(
        `${row.entryKey}/${row.tagSlug} score ${row.score} is below AUTO threshold ${thresholds[row.tagSlug]}`,
      );
    }
  }
  const removals = sortPairs(
    reviewedRemovals.removals.map((row) => ({
      entryKey: row.entryKey,
      tagSlug: row.tagSlug,
      previousEntryContentHash: row.previousEntryContentHash,
      reason: row.reason,
      runId: row.runId,
    })),
  );
  const certificationBinding = {
    schemaVersion: 'synac-production-tagging-certification-binding-v1',
    productionManifestHash: input.productionManifest.artifactHash,
    reviewedCandidatesHash: input.reviewed.artifactHash,
    localReviewManifestHash: reviewed.reviewManifestHash,
    terraCandidatesHash: reviewed.sourceCandidatesHash,
    predecessorArtifactHash: previous.artifactHash,
    reviewedRemovalsArtifactHash: reviewedRemovals.artifactHash,
    sourceControlsArtifactHash: input.sourceControls?.artifactHash ?? null,
    sourceControlPairCount: sourceControlPairs.size,
    removals,
  };
  const modelHash = hashJson(modelBinding);
  const configHash = hashJson(configBinding);
  const calibrationHash = hashJson(calibrationBinding);
  const certificationHash = hashJson(certificationBinding);
  const thresholdsHash = stableJsonHash(thresholds);
  const artifactValue = {
    schemaVersion: 1 as const,
    taxonomyVersion: rubric.taxonomyVersion,
    taxonomyHash,
    run: {
      runId: input.runId,
      corpusHash: input.corpus.corpusHash,
      model: `${production.model}:${production.reasoningEffort}`,
      modelHash,
      promptHash: production.promptHash,
      configHash,
      calibrationHash,
      certificationHash,
      thresholds,
      thresholdsHash,
      ...(previous.assignmentsHash
        ? { previousAssignmentsHash: previous.assignmentsHash }
        : {}),
      labelOrigin: 'synthetic_ai_panel' as const,
      createdAt: input.createdAt,
      release: true,
    },
    assignments,
    removals,
  };
  const parsed = tagAssignmentsFileSchema.safeParse(artifactValue);
  if (!parsed.success)
    throw new Error(
      `emitted assignment artifact is invalid: ${parsed.error.message}`,
    );

  const priorPairs = new Set(previousByPair.keys());
  const outputPairs = new Set(assignments.map(pairKey));
  const added = assignments.filter((row) => !priorPairs.has(pairKey(row)));
  const removed = removals;
  const reclassified = assignments.filter((row) => {
    const prior = previousByPair.get(pairKey(row));
    return (
      prior !== undefined && prior.entryContentHash !== row.entryContentHash
    );
  });
  const preserved = assignments.filter((row) => {
    const prior = previousByPair.get(pairKey(row));
    return (
      prior !== undefined && prior.entryContentHash === row.entryContentHash
    );
  });
  if (
    [...priorPairs].some(
      (identity) => !outputPairs.has(identity) && !removalsByPair.has(identity),
    )
  ) {
    throw new Error('predecessor pair was dropped without reviewed removal');
  }
  const perTag = publishedTagSlugs.map((tagSlug) => ({
    tagSlug,
    assignments: floor.perTag.get(tagSlug) ?? 0,
    added: added.filter((row) => row.tagSlug === tagSlug).length,
    removed: removed.filter((row) => row.tagSlug === tagSlug).length,
    sourceControls: [...sourceControlPairs].filter((identity) =>
      identity.endsWith(`\0${tagSlug}`),
    ).length,
  }));
  const artifactHash = sha256Text(serializeJson(parsed.data));
  const report: JsonRecord = {
    schemaVersion: 'synac-tag-assignment-release-report-v1',
    runId: input.runId,
    createdAt: input.createdAt,
    release: {
      predecessorAssignmentCount: previous.value?.assignments.length ?? 0,
      assignmentCount: assignments.length,
      addedCount: added.length,
      removedCount: removed.length,
      reclassifiedCount: reclassified.length,
      preservedCount: preserved.length,
      uniqueEntryCount: floor.uniqueEntryCount,
      corpusEntryCount: input.corpus.entries.length,
      coverage: floor.coverage,
      perTag,
      added: sortPairs(
        added.map((row) => ({
          entryKey: row.entryKey,
          tagSlug: row.tagSlug,
          entryContentHash: row.entryContentHash,
        })),
      ),
      removed,
      reclassified: sortPairs(
        reclassified.map((row) => ({
          entryKey: row.entryKey,
          tagSlug: row.tagSlug,
          previousEntryContentHash: previousByPair.get(pairKey(row))
            ?.entryContentHash,
          entryContentHash: row.entryContentHash,
        })),
      ),
    },
    hashes: {
      assignmentArtifactHash: artifactHash,
      predecessorArtifactHash: previous.artifactHash,
      reviewedRemovalsArtifactHash: reviewedRemovals.artifactHash,
      reviewedCandidatesArtifactHash: input.reviewed.artifactHash,
      localReviewManifestHash: reviewed.reviewManifestHash,
      terraCandidatesHash: reviewed.sourceCandidatesHash,
      productionManifestHash: input.productionManifest.artifactHash,
      entryIndexHash: input.entryIndex.artifactHash,
      rubricArtifactHash: input.rubric.artifactHash,
      rubricHash: rubric.rubricHash,
      taxonomyHash,
      corpusHash: input.corpus.corpusHash,
      modelHash,
      promptHash: production.promptHash,
      configHash,
      calibrationHash,
      certificationHash,
      thresholdsHash,
    },
    hashInputs: {
      model: modelBinding,
      config: configBinding,
      calibration: calibrationBinding,
      certification: certificationBinding,
      thresholds,
      thresholdPolicy: thresholdsBinding,
    },
  };
  return { artifact: parsed.data, report };
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readOptional(
  path: string,
  files: FileOperations,
): Promise<string | undefined> {
  try {
    return await files.readFile(path, 'utf8');
  } catch (error) {
    if (missingFile(error)) return undefined;
    throw error;
  }
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function exactArtifact(text: string, semanticHash = false): HashedArtifact {
  const value = parseJson(text, 'artifact');
  return {
    value,
    artifactHash: semanticHash ? hashJson(value) : sha256Text(text),
  };
}

async function currentCorpus(rootDir: string): Promise<{
  corpus: CurrentCorpus;
  tags: TagsFile;
  sourceControls: SourceControlSuite;
}> {
  const loaded = await loadContentDir(`${rootDir}/content`);
  if (!loaded.ok) throw new Error(loaded.errors.join('\n'));
  const compiled = compileContent(
    { ...loaded.input, tagAssignments: undefined },
    { allowUnreleasedTagging: true },
  );
  if (!compiled.ok) throw new Error(compiled.errors.join('\n'));
  const sensesByEntry = new Map<string, typeof compiled.dataset.senses>();
  for (const sense of compiled.dataset.senses) {
    const senses = sensesByEntry.get(sense.entryKey) ?? [];
    senses.push(sense);
    sensesByEntry.set(sense.entryKey, senses);
  }
  const classificationEntries = compileClassificationEntries(
    compiled.dataset.entries,
    compiled.dataset.senses,
  );
  const reviewedControls = await loadReviewedControls(
    `${rootDir}/experiments/tagging/synthetic-reference/reviewed-controls`,
    FROZEN_RUBRIC,
    classificationEntries,
  );
  const expandedControls = await loadReviewedControls(
    `${rootDir}/experiments/tagging/production-backfill/expanded-source-controls`,
    FROZEN_RUBRIC,
    classificationEntries,
  );
  const recoveryControls = await loadReviewedControls(
    `${rootDir}/experiments/tagging/production-backfill/recovery-source-controls`,
    FROZEN_RUBRIC,
    classificationEntries,
  );
  const combinedControls = {
    files: [
      ...reviewedControls.files,
      ...expandedControls.files,
      ...recoveryControls.files,
    ],
    rows: [
      ...reviewedControls.rows,
      ...expandedControls.rows,
      ...recoveryControls.rows,
    ],
  };
  const controlPairs = new Set<string>();
  for (const { tagSlug, row } of combinedControls.rows) {
    const identity = `${row.entryKey}\0${tagSlug}`;
    if (controlPairs.has(identity)) {
      throw new Error(
        `duplicate source control across base and expanded sets: ${row.entryKey}/${tagSlug}`,
      );
    }
    controlPairs.add(identity);
  }
  const servingHashes = new Map(
    compiled.dataset.entries.map((entry) => {
      const senses = sensesByEntry.get(entry.key) ?? [];
      return [entry.key, classificationEntryHash(entry, senses)] as const;
    }),
  );
  const sourceControls: SourceControlSuite = {
    artifactHash: stableJsonHash(combinedControls),
    files: combinedControls.files.map(({ tagSlug, fileHash, rowCount }) => ({
      tagSlug,
      fileHash,
      rowCount,
    })),
    positives: combinedControls.rows
      .filter(({ row }) => row.polarity === 'positive')
      .map(({ tagSlug, row }) => ({
        entryKey: row.entryKey,
        entryContentHash:
          servingHashes.get(row.entryKey) ??
          (() => {
            throw new Error(`reviewed source control missing ${row.entryKey}`);
          })(),
        tagSlug,
        ruleId: row.ruleId,
        senseKey: row.senseKey,
        primaryReviewer: row.primaryReviewer,
        secondaryReviewer: row.secondaryReviewer,
      })),
  };
  return {
    tags: loaded.input.tags,
    sourceControls,
    corpus: {
      contentVersion: compiled.dataset.contentVersion,
      corpusHash: classificationCorpusHash(
        compiled.dataset.entries,
        compiled.dataset.senses,
      ),
      entries: compiled.dataset.entries
        .map((entry) => {
          const senses = sensesByEntry.get(entry.key) ?? [];
          return {
            entryKey: entry.key,
            entryContentHash: classificationEntryHash(entry, senses),
            evidenceSenseKeys: senses.map((sense) => sense.key).sort(),
          };
        })
        .sort((left, right) => left.entryKey.localeCompare(right.entryKey)),
    },
  };
}

export async function writeEmissionFiles(
  input: WriteEmissionInput,
): Promise<void> {
  const files = input.files ?? { readFile, writeFile };
  const [existingOutput, existingReport] = await Promise.all([
    readOptional(input.outputPath, files),
    readOptional(input.reportPath, files),
  ]);
  if (
    !input.replace &&
    (existingOutput !== undefined || existingReport !== undefined)
  ) {
    throw new Error(
      'output or report already exists; pass --replace after predecessor review',
    );
  }
  if (input.replace && existingOutput !== undefined) {
    const hashes = input.report.hashes;
    if (
      !isRecord(hashes) ||
      hashes.predecessorArtifactHash !== sha256Text(existingOutput)
    ) {
      throw new Error(
        'replace predecessor hash does not match the existing output',
      );
    }
  }
  await files.writeFile(input.reportPath, serializeJson(input.report));
  await files.writeFile(input.outputPath, serializeJson(input.artifact));
}

type CliOptions = {
  outputPath: string;
  reportPath: string;
  reviewedPath: string;
  manifestPath: string;
  indexPath: string;
  rubricPath: string;
  previousPath?: string;
  removalsPath?: string;
  runId: string;
  createdAt: string;
  replace: boolean;
};

function parseCli(
  args: readonly string[],
  rootDir: string,
  directory: string,
): CliOptions {
  const values = new Map<string, string>();
  let replace = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--replace') {
      replace = true;
      continue;
    }
    if (!argument.startsWith('--'))
      throw new Error(`unexpected argument ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`${argument} requires a value`);
    if (values.has(argument)) throw new Error(`duplicate option ${argument}`);
    values.set(argument, value);
    index += 1;
  }
  const allowed = new Set([
    '--output',
    '--report',
    '--reviewed',
    '--manifest',
    '--index',
    '--rubric',
    '--previous',
    '--removals',
    '--run-id',
    '--created-at',
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`unknown option ${key}`);
  }
  const outputPath = values.get('--output');
  const runId = values.get('--run-id');
  const createdAt = values.get('--created-at');
  if (!outputPath || !runId || !createdAt) {
    throw new Error(
      'usage: emit-assignments.ts --output <path> --run-id <id> --created-at <ISO timestamp> [--report <path>] [--previous <path>] [--removals <path>] [--replace]',
    );
  }
  return {
    outputPath: resolve(outputPath),
    reportPath: resolve(values.get('--report') ?? `${outputPath}.report.json`),
    reviewedPath: resolve(
      values.get('--reviewed') ?? `${directory}/reviewed-candidates.json`,
    ),
    manifestPath: resolve(
      values.get('--manifest') ?? `${directory}/manifest.json`,
    ),
    indexPath: resolve(
      values.get('--index') ?? `${directory}/entry-index.json`,
    ),
    rubricPath: resolve(
      values.get('--rubric') ??
        `${rootDir}/experiments/tagging/served-model-bakeoff/input.json`,
    ),
    ...(values.has('--previous')
      ? { previousPath: resolve(values.get('--previous') as string) }
      : {}),
    ...(values.has('--removals')
      ? { removalsPath: resolve(values.get('--removals') as string) }
      : {}),
    runId,
    createdAt,
    replace,
  };
}

export async function runEmitter(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const rootDir = fileURLToPath(new URL('../../..', import.meta.url));
  const options = parseCli(args, rootDir, directory);
  const files: FileOperations = { readFile, writeFile };
  const [
    reviewedText,
    manifestText,
    indexText,
    rubricText,
    compiled,
    existingOutput,
  ] = await Promise.all([
    files.readFile(options.reviewedPath, 'utf8'),
    files.readFile(options.manifestPath, 'utf8'),
    files.readFile(options.indexPath, 'utf8'),
    files.readFile(options.rubricPath, 'utf8'),
    currentCorpus(rootDir),
    readOptional(options.outputPath, files),
  ]);
  const defaultPreviousPath = `${rootDir}/content/tag-assignments.json`;
  const explicitPrevious = options.previousPath
    ? await files.readFile(options.previousPath, 'utf8')
    : undefined;
  const defaultPrevious =
    options.outputPath !== resolve(defaultPreviousPath)
      ? await readOptional(defaultPreviousPath, files)
      : undefined;
  const predecessorCandidates = [
    ['existing output', existingOutput],
    ['explicit predecessor', explicitPrevious],
    ['checked-in predecessor', defaultPrevious],
  ] as const;
  const availablePredecessors: Array<readonly [string, string]> = [];
  for (const [label, text] of predecessorCandidates) {
    if (text !== undefined) availablePredecessors.push([label, text]);
  }
  const predecessorHashes = new Set(
    availablePredecessors.map((candidate) => sha256Text(candidate[1])),
  );
  if (predecessorHashes.size > 1) {
    throw new Error(
      `predecessor artifacts differ: ${availablePredecessors.map((candidate) => candidate[0]).join(', ')}`,
    );
  }
  const predecessorText = availablePredecessors[0]?.[1];
  if (existingOutput !== undefined && !options.replace) {
    throw new Error(
      'output already exists; pass --replace after predecessor review',
    );
  }
  const removalsText = options.removalsPath
    ? await files.readFile(options.removalsPath, 'utf8')
    : undefined;
  const emission = buildAssignmentEmission({
    reviewed: exactArtifact(reviewedText),
    productionManifest: exactArtifact(manifestText, true),
    entryIndex: exactArtifact(indexText, true),
    rubric: exactArtifact(rubricText),
    tags: compiled.tags,
    corpus: compiled.corpus,
    sourceControls: compiled.sourceControls,
    runId: options.runId,
    createdAt: options.createdAt,
    ...(predecessorText !== undefined
      ? { previous: exactArtifact(predecessorText) }
      : {}),
    ...(removalsText !== undefined
      ? { removals: exactArtifact(removalsText) }
      : {}),
  });
  await writeEmissionFiles({
    outputPath: options.outputPath,
    reportPath: options.reportPath,
    replace: options.replace,
    ...emission,
    files,
  });
  console.log(
    JSON.stringify(
      {
        outputPath: options.outputPath,
        reportPath: options.reportPath,
        assignments: emission.artifact.assignments.length,
        coverage: (emission.report.release as JsonRecord).coverage,
        artifactHash: (emission.report.hashes as JsonRecord)
          .assignmentArtifactHash,
      },
      null,
      2,
    ),
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) await runEmitter();
