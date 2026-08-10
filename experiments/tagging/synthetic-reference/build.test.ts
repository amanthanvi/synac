import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildReferenceArtifacts, parseBuildOptions } from './build.ts';
import { sha256 } from './canonical.ts';
import type { ModelLineages, RuntimeConfig } from './types.ts';

const directFamilies = [
  'family-p1',
  'family-p2',
  'family-p3',
  'family-p4',
  'family-a1',
  'family-a2',
] as const;
const laneNames = ['P1', 'P2', 'P3', 'P4', 'A1', 'A2', 'C+', 'C-'] as const;
const models: ModelLineages = {
  schemaVersion: 'synac-model-lineages-v1',
  lanes: laneNames.map((lane, index) => ({
    lane,
    trainingOrganization: `organization-${Math.min(index, 5)}`,
    baseModelFamily:
      index < 6 ? directFamilies[index] : directFamilies[index - 6],
    ancestry: 'test-only declared ancestry',
    provider: `provider-${index}`,
    immutableModelId: `immutable-model-${index}`,
    backendFingerprint: `backend-${index}`,
    openWeights: index === 0,
    weightsHash: index === 0 ? sha256('test-only-weights') : null,
  })),
};
const runtime: RuntimeConfig = {
  schemaVersion: 'synac-runtime-config-v1',
  runId: 'synthetic-reference-integration-test',
  frozenAt: '2026-08-10T00:00:00.000Z',
  temperature: 0,
  seed: 189,
  tokenLimit: 8192,
  tools: false,
  candidates: 1,
};

test('build CLI accepts the package-manager argument separator', () => {
  assert.deepEqual(
    parseBuildOptions([
      '--',
      '--models',
      'models.json',
      '--runtime',
      'runtime.json',
      '--output',
      'run',
    ]),
    {
      models: path.resolve('models.json'),
      runtime: path.resolve('runtime.json'),
      output: path.resolve('run'),
    },
  );
});

test('live content compiles to an immutable 1,500-entry staged front half', async (context) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'synac-reference-test-'));
  context.after(async () => rm(parent, { recursive: true, force: true }));
  const outputDirectory = path.join(parent, 'run');
  const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const result = await buildReferenceArtifacts({
    repositoryRoot,
    outputDirectory,
    models,
    runtime,
  });
  const controls = JSON.parse(
    await readFile(path.join(outputDirectory, 'controls.json'), 'utf8'),
  ) as {
    protocolReady: boolean;
    perTag: Array<{ positiveShortfall: number; negativeShortfall: number }>;
  };
  const artifactShortfall = controls.perTag.reduce(
    (total, report) =>
      total + report.positiveShortfall + report.negativeShortfall,
    0,
  );
  assert.equal(result.controlsReady, controls.protocolReady);
  assert.equal(result.controlShortfall, artifactShortfall);
  const manifest = JSON.parse(
    await readFile(path.join(outputDirectory, 'manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  assert.equal(manifest.entryCount, 1500);
  assert.equal(manifest.controlsReady, controls.protocolReady);
  await assert.rejects(
    buildReferenceArtifacts({
      repositoryRoot,
      outputDirectory,
      models,
      runtime,
    }),
    /exist|EEXIST/i,
  );
});
