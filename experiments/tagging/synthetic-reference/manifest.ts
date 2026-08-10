import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonical, sha256 } from './canonical.ts';
import type {
  ControlSuite,
  CorpusSnapshot,
  FrozenRubric,
  InjectionSuite,
  ModelLineages,
  RunManifest,
  RuntimeConfig,
  ReviewedControlFileBinding,
  SplitPlan,
} from './types.ts';
import { TAG_IDS } from './types.ts';

export async function codeHash(
  sourceDirectory: string,
  reviewedFiles: readonly ReviewedControlFileBinding[],
): Promise<string> {
  const names = (await readdir(sourceDirectory))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort();
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      hash: sha256(await readFile(path.join(sourceDirectory, name))),
    })),
  );
  return hashCanonical({ sourceFiles: files, reviewedFiles });
}

export async function buildManifest(
  input: Readonly<{
    rubric: FrozenRubric;
    corpus: CorpusSnapshot;
    split: SplitPlan;
    controls: ControlSuite;
    injections: InjectionSuite;
    models: ModelLineages;
    runtime: RuntimeConfig;
    sourceDirectory: string;
    reviewedFiles: readonly ReviewedControlFileBinding[];
  }>,
): Promise<RunManifest> {
  const rubricHash = hashCanonical(input.rubric);
  const runtimeHash = hashCanonical({
    config: input.runtime,
    engine: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
  const hashes = {
    corpus: input.corpus.corpusHash,
    rubric: rubricHash,
    split: input.split.splitHash,
    controls: input.controls.controlHash,
    injectionPackets: input.injections.packetHash,
    code: await codeHash(input.sourceDirectory, input.reviewedFiles),
    runtime: runtimeHash,
    models: hashCanonical(input.models),
  };
  const core = {
    schemaVersion: 'synac-reference-manifest-v1' as const,
    protocolVersion: 'synac-ai-adjudication-v1' as const,
    runId: input.runtime.runId,
    frozenAt: input.runtime.frozenAt,
    entryCount: 1500 as const,
    tagIds: TAG_IDS,
    hashes,
    masterSeed: sha256(
      `${hashes.corpus}\0${hashes.rubric}\0synac-ai-adjudication-v1`,
    ),
    controlsReady: input.controls.protocolReady,
  };
  return { ...core, manifestHash: hashCanonical(core) };
}
