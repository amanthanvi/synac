import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  TagAssignmentsFile,
  TagsFile,
} from '../../../tools/content/src/model.ts';
import { stableJsonHash } from '../../../tools/content/src/tagging.ts';
import {
  buildAssignmentEmission,
  hashJson,
  serializeJson,
  sha256Text,
  writeEmissionFiles,
  type BuildEmissionInput,
  type CorpusEntry,
  type HashedArtifact,
  type SourceControlSuite,
} from './emit-assignments.ts';

const tagSlugs = Array.from({ length: 11 }, (_value, index) => `tag-${index}`);

function entry(index: number): CorpusEntry {
  const entryKey = `TERM:entry-${String(index).padStart(4, '0')}`;
  return {
    entryKey,
    entryContentHash: sha256Text(entryKey),
    evidenceSenseKeys: [`sense-${String(index).padStart(4, '0')}`],
  };
}

function exactArtifact(value: unknown): HashedArtifact {
  return { value, artifactHash: sha256Text(serializeJson(value)) };
}

function semanticArtifact(value: unknown): HashedArtifact {
  return { value, artifactHash: hashJson(value) };
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseObjectKeys(item)]),
  );
}

function makeFixture(
  options: {
    corpusSize?: number;
    acceptedPerTag?: number;
    runId?: string;
  } = {},
): BuildEmissionInput {
  const corpusSize = options.corpusSize ?? 300;
  const acceptedPerTag = options.acceptedPerTag ?? 25;
  const runId = options.runId ?? 'release-2';
  const entries = Array.from({ length: corpusSize }, (_value, index) =>
    entry(index),
  );
  const corpusHash = hashJson(
    entries.map(({ entryKey, entryContentHash }) => ({
      entryKey,
      entryContentHash,
    })),
  );
  const contentVersion = sha256Text(`content-${corpusSize}`);
  const tags: TagsFile = {
    taxonomyVersion: '2',
    tags: tagSlugs.map((slug) => ({
      slug,
      name: slug,
      lifecycle: 'PUBLISHED',
    })),
    retiredTags: [],
  };
  const contracts = tagSlugs.map((slug) => ({
    slug,
    name: slug,
    definition: `${slug} definition`,
    inclusionRules: [`${slug} include`],
    exclusionRules: [`${slug} exclude`],
  }));
  const rubricValue = {
    schemaVersion: 'synac-served-model-anchor-v2',
    taxonomyVersion: 2,
    benchmarkHash: sha256Text('benchmark'),
    globalRules: ['Apply only when central.'],
    contracts,
    cases: [],
  };
  const rubricHash = hashJson({
    taxonomyVersion: rubricValue.taxonomyVersion,
    globalRules: rubricValue.globalRules,
    contracts: rubricValue.contracts,
  });
  const indexValue = {
    schemaVersion: 'synac-production-entry-index-v1',
    contentVersion,
    entries: entries.map(({ entryKey, entryContentHash }) => ({
      entryKey,
      entryContentHash,
    })),
    chunks: [],
  };
  const entryIndex = semanticArtifact(indexValue);
  const manifestValue = {
    schemaVersion: 'synac-production-backfill-manifest-v1',
    model: 'gpt-5.6-terra',
    reasoningEffort: 'max',
    passes: ['a', 'b'],
    chunkSize: 20,
    entryCount: entries.length,
    requestCount: 2,
    contentVersion,
    corpusHash,
    entryIndexHash: entryIndex.artifactHash,
    rubricHash,
    promptHash: sha256Text('terra-prompt'),
    configHash: sha256Text('terra-config'),
    requestFileHash: sha256Text('terra-requests'),
  };
  const productionManifest = semanticArtifact(manifestValue);
  const accepted = tagSlugs.flatMap((tagSlug, tagIndex) =>
    Array.from({ length: acceptedPerTag }, (_value, withinTag) => {
      const source = entries[tagIndex * acceptedPerTag + withinTag];
      return {
        entryKey: source.entryKey,
        entryContentHash: source.entryContentHash,
        tagSlug,
        score: 0.99,
        reviews: {
          graniteInclusion: {
            verdict: 'SUPPORT',
            confidence: 96,
            ruleIds: ['include:1', 'global:substantive-topic'],
            evidenceSenseKeys: [source.evidenceSenseKeys[0]],
            injectionSuspected: false,
            validResponse: true,
            attempts: 1,
          },
          gemmaExclusion: {
            verdict: 'SUPPORT',
            confidence: 94,
            ruleIds: ['include:1'],
            evidenceSenseKeys: [source.evidenceSenseKeys[0]],
            injectionSuspected: false,
            validResponse: true,
            attempts: 1,
          },
        },
      };
    }),
  );
  const reviewedValue = {
    schemaVersion: 'synac-reviewed-production-candidates-v1',
    reviewManifestHash: sha256Text('local-manifest'),
    source: {
      productionManifestHash: productionManifest.artifactHash,
      contentVersion,
      corpusHash,
      entryIndexHash: entryIndex.artifactHash,
      rubricHash,
      candidatesHash: sha256Text('terra-candidates'),
    },
    roles: [
      {
        id: 'granite-inclusion',
        model: 'granite3.3:8b',
        order: 'normal',
        promptHash: sha256Text('granite-prompt'),
      },
      {
        id: 'gemma-exclusion',
        model: 'gemma3:12b',
        order: 'reverse',
        promptHash: sha256Text('gemma-prompt'),
      },
    ],
    ollama: {
      version: '0.32.6',
      models: [
        { requestedModel: 'granite3.3:8b', digest: sha256Text('granite') },
        { requestedModel: 'gemma3:12b', digest: sha256Text('gemma') },
      ],
    },
    candidateCount: accepted.length,
    acceptedCandidateCount: accepted.length,
    reviewCount: 0,
    abstainCount: 0,
    accepted,
    review: [],
    abstain: [],
  };
  return {
    reviewed: exactArtifact(reviewedValue),
    productionManifest,
    entryIndex,
    rubric: exactArtifact(rubricValue),
    tags,
    corpus: { contentVersion, corpusHash, entries },
    runId,
    createdAt: '2026-08-10T12:00:00Z',
  };
}

function refreshedReview(input: BuildEmissionInput): void {
  input.reviewed = exactArtifact(input.reviewed.value);
}

function previousWithExtra(
  current: BuildEmissionInput,
  stale = false,
): HashedArtifact {
  const initialInput = makeFixture({ runId: 'release-1' });
  const initial = buildAssignmentEmission(initialInput).artifact;
  const extra = current.corpus.entries[299];
  const previous: TagAssignmentsFile = {
    ...initial,
    assignments: [
      ...initial.assignments,
      {
        entryKey: extra.entryKey,
        entryContentHash: stale
          ? sha256Text('old-entry-content')
          : extra.entryContentHash,
        tagSlug: tagSlugs[0],
        authority: 'SYNTHETIC_REFERENCE',
        lane: 'AUTO',
        score: 0.99,
        runId: initial.run.runId,
      },
    ],
  };
  return exactArtifact(previous);
}

test('successful emission is sorted, AUTO-only, deterministic, and uses recomputable hashes', () => {
  const input = makeFixture();
  const reviewed = input.reviewed.value as { accepted: unknown[] };
  reviewed.accepted.reverse();
  refreshedReview(input);
  const first = buildAssignmentEmission(input);
  const second = buildAssignmentEmission(input);

  assert.deepEqual(first, second);
  assert.equal(first.artifact.assignments.length, 275);
  assert.equal(first.artifact.run.release, true);
  assert.equal(first.artifact.run.labelOrigin, 'synthetic_ai_panel');
  assert.equal(
    first.artifact.assignments.every((row) => row.lane === 'AUTO'),
    true,
  );
  assert.equal(
    first.artifact.assignments.every((row) => row.score === 0.99),
    true,
  );
  assert.deepEqual(
    first.artifact.assignments,
    [...first.artifact.assignments].sort(
      (left, right) =>
        left.entryKey.localeCompare(right.entryKey) ||
        left.tagSlug.localeCompare(right.tagSlug),
    ),
  );
  const hashInputs = first.report.hashInputs as Record<string, unknown>;
  assert.equal(first.artifact.run.modelHash, hashJson(hashInputs.model));
  assert.equal(first.artifact.run.configHash, hashJson(hashInputs.config));
  assert.equal(
    first.artifact.run.calibrationHash,
    hashJson(hashInputs.calibration),
  );
  assert.equal(
    first.artifact.run.certificationHash,
    hashJson(hashInputs.certification),
  );
  assert.equal(
    first.artifact.run.thresholdsHash,
    hashJson(hashInputs.thresholds),
  );
});

test('duplicate accepted pairs are rejected', () => {
  const input = makeFixture();
  const reviewed = input.reviewed.value as {
    candidateCount: number;
    acceptedCandidateCount: number;
    accepted: unknown[];
  };
  reviewed.accepted.push(structuredClone(reviewed.accepted[0]));
  reviewed.candidateCount += 1;
  reviewed.acceptedCandidateCount += 1;
  refreshedReview(input);
  assert.throws(
    () => buildAssignmentEmission(input),
    /duplicate reviewed pair/,
  );
});

test('coverage and per-tag release floors are enforced independently', () => {
  assert.throws(
    () => buildAssignmentEmission(makeFixture({ corpusSize: 1000 })),
    /coverage 27\.50% is below required 30\.00%/,
  );
  assert.throws(
    () => buildAssignmentEmission(makeFixture({ acceptedPerTag: 24 })),
    /has 24 assignments; at least 25 required/,
  );
});

test('double-reviewed positive source controls supplement rare tags without lowering model gates', () => {
  const input = makeFixture({ acceptedPerTag: 24 });
  const positives = tagSlugs.map((tagSlug, tagIndex) => {
    const source = input.corpus.entries[tagIndex * 24 + 24];
    return {
      entryKey: source.entryKey,
      entryContentHash: source.entryContentHash,
      tagSlug,
      ruleId: `T${String(tagIndex + 1).padStart(2, '0')}-I01`,
      senseKey: source.evidenceSenseKeys[0],
      primaryReviewer: 'primary-agent',
      secondaryReviewer: 'secondary-agent',
    };
  });
  const sourceControls: SourceControlSuite = {
    artifactHash: sha256Text('reviewed-source-controls'),
    files: tagSlugs.map((tagSlug) => ({
      tagSlug,
      fileHash: `sha256:${sha256Text(tagSlug)}`,
      rowCount: 50,
    })),
    positives,
  };
  input.sourceControls = sourceControls;

  const emission = buildAssignmentEmission(input);
  assert.equal(emission.artifact.assignments.length, 25 * 11);
  for (const row of positives) {
    const assignment = emission.artifact.assignments.find(
      (candidate) =>
        candidate.entryKey === row.entryKey &&
        candidate.tagSlug === row.tagSlug,
    );
    assert.equal(assignment?.score, 1);
    assert.equal(assignment?.authority, 'SYNTHETIC_REFERENCE');
  }
  const hashes = emission.report.hashes as Record<string, unknown>;
  assert.equal(typeof hashes.certificationHash, 'string');
});

test('unchanged predecessor pairs omitted by the new review are preserved', () => {
  const input = makeFixture();
  input.previous = previousWithExtra(input);
  const output = buildAssignmentEmission(input).artifact;
  const extra = input.corpus.entries[299];
  const preserved = output.assignments.find(
    (row) => row.entryKey === extra.entryKey && row.tagSlug === tagSlugs[0],
  );
  assert.ok(preserved);
  assert.equal(preserved.score, 0.99);
  assert.equal(preserved.runId, input.runId);
});

test('previousAssignmentsHash is stable across predecessor formatting and key order', () => {
  const prettyInput = makeFixture();
  const compactInput = makeFixture();
  const predecessor = previousWithExtra(prettyInput);
  const reordered = reverseObjectKeys(predecessor.value);
  const compactText = JSON.stringify(reordered);
  prettyInput.previous = predecessor;
  compactInput.previous = {
    value: JSON.parse(compactText),
    artifactHash: sha256Text(compactText),
  };

  assert.notEqual(
    prettyInput.previous.artifactHash,
    compactInput.previous.artifactHash,
  );
  const prettyHash =
    buildAssignmentEmission(prettyInput).artifact.run.previousAssignmentsHash;
  const compactHash =
    buildAssignmentEmission(compactInput).artifact.run.previousAssignmentsHash;
  assert.equal(prettyHash, stableJsonHash(predecessor.value));
  assert.equal(compactHash, prettyHash);
});

test('a changed predecessor entry blocks without fresh accepted classification or removal', () => {
  const input = makeFixture();
  input.previous = previousWithExtra(input, true);
  assert.throws(
    () => buildAssignmentEmission(input),
    /stale predecessor pair .* requires fresh classification/,
  );
});

test('an explicit reviewed removal bound to predecessor, current entry, and run permits a drop', () => {
  const input = makeFixture();
  input.previous = previousWithExtra(input, true);
  const extra = input.corpus.entries[299];
  const prior = input.previous.value as TagAssignmentsFile;
  const priorRow = prior.assignments.find(
    (row) => row.entryKey === extra.entryKey && row.tagSlug === tagSlugs[0],
  );
  assert.ok(priorRow);
  const removals = {
    schemaVersion: 'synac-reviewed-tag-removals-v1',
    predecessorHash: input.previous.artifactHash,
    reviewedCandidatesHash: input.reviewed.artifactHash,
    removals: [
      {
        entryKey: priorRow.entryKey,
        tagSlug: priorRow.tagSlug,
        previousEntryContentHash: priorRow.entryContentHash,
        currentEntryContentHash: extra.entryContentHash,
        reason: 'Fresh review no longer supports this tag.',
        runId: input.runId,
      },
    ],
  };
  input.removals = exactArtifact(removals);
  const emission = buildAssignmentEmission(input);
  assert.equal(
    emission.artifact.assignments.some(
      (row) => row.entryKey === extra.entryKey && row.tagSlug === tagSlugs[0],
    ),
    false,
  );
  assert.deepEqual(emission.artifact.removals, [
    {
      entryKey: priorRow.entryKey,
      tagSlug: priorRow.tagSlug,
      previousEntryContentHash: priorRow.entryContentHash,
      reason: 'Fresh review no longer supports this tag.',
      runId: input.runId,
    },
  ]);
});

test('existing output or report refuses overwrite without explicit replace mode', async () => {
  const emission = buildAssignmentEmission(makeFixture());
  let writes = 0;
  await assert.rejects(
    writeEmissionFiles({
      outputPath: 'assignments.json',
      reportPath: 'report.json',
      replace: false,
      ...emission,
      files: {
        readFile: async () => '{}',
        writeFile: async () => {
          writes += 1;
        },
      },
    }),
    /already exists; pass --replace/,
  );
  assert.equal(writes, 0);

  await assert.rejects(
    writeEmissionFiles({
      outputPath: 'assignments.json',
      reportPath: 'report.json',
      replace: true,
      ...emission,
      files: {
        readFile: async () => '{"different":true}',
        writeFile: async () => {
          writes += 1;
        },
      },
    }),
    /predecessor hash does not match/,
  );
  assert.equal(writes, 0);
});
