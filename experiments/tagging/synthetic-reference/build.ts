import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileContent } from '../../../tools/content/src/compile.ts';
import { loadContentDir } from '../../../tools/content/src/load.ts';
import { hashCanonical, sha256 } from './canonical.ts';
import { buildControls, controlShortfall } from './controls.ts';
import { compileClassificationEntries, corpusSnapshot } from './corpus.ts';
import {
  buildConceptFamilies,
  buildSplitPlan,
  resolveEntryReference,
  selectSplitEntries,
} from './families.ts';
import { buildInjectionPackets } from './injections.ts';
import { buildManifest } from './manifest.ts';
import { validatePublicBenchmark } from './public-benchmark.ts';
import { loadReviewedControls } from './reviewed-controls.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import type { ModelLineages, RuntimeConfig } from './types.ts';
import {
  validateControls,
  validateCorpus,
  validateInjectionSuite,
  validateManifest,
  validateModelLineages,
  validateRubric,
  validateRuntimeConfig,
  validateSplit,
} from './validators.ts';

export type BuildOptions = Readonly<{
  models: string;
  runtime: string;
  output: string;
}>;

export function parseBuildOptions(argv: readonly string[]): BuildOptions {
  const argumentsWithoutSeparator = argv.filter((value) => value !== '--');
  const values = new Map<string, string>();
  for (let index = 0; index < argumentsWithoutSeparator.length; index += 2) {
    const name = argumentsWithoutSeparator[index];
    const value = argumentsWithoutSeparator[index + 1];
    if (!name?.startsWith('--') || !value)
      throw new Error(
        'usage: build.ts --models <json> --runtime <json> --output <directory>',
      );
    values.set(name.slice(2), value);
  }
  const models = values.get('models');
  const runtime = values.get('runtime');
  const output = values.get('output');
  if (!models || !runtime || !output || values.size !== 3)
    throw new Error(
      'usage: build.ts --models <json> --runtime <json> --output <directory>',
    );
  return {
    models: path.resolve(models),
    runtime: path.resolve(runtime),
    output: path.resolve(output),
  };
}

async function jsonFile<T>(
  filePath: string,
  validate: (value: unknown) => T,
): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${filePath}: cannot parse JSON`, { cause: error });
  }
  return validate(value);
}

async function writeJson(
  outputDirectory: string,
  name: string,
  value: unknown,
): Promise<void> {
  await writeFile(
    path.join(outputDirectory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
}

export async function buildReferenceArtifacts(
  input: Readonly<{
    repositoryRoot: string;
    outputDirectory: string;
    models: ModelLineages;
    runtime: RuntimeConfig;
  }>,
): Promise<
  Readonly<{
    manifestHash: string;
    corpusHash: string;
    controlShortfall: number;
    controlsReady: boolean;
  }>
> {
  const rubric = validateRubric(FROZEN_RUBRIC);
  const models = validateModelLineages(input.models);
  const runtime = validateRuntimeConfig(input.runtime);
  const loaded = await loadContentDir(
    path.join(input.repositoryRoot, 'content'),
  );
  if (!loaded.ok) throw new Error(loaded.errors.join('\n'));
  const compiled = compileContent(loaded.input, {
    allowUnreleasedTagging: true,
  });
  if (!compiled.ok) throw new Error(compiled.errors.join('\n'));
  const allEntries = compileClassificationEntries(
    compiled.dataset.entries,
    compiled.dataset.senses,
  );
  const reviewed = await loadReviewedControls(
    fileURLToPath(new URL('reviewed-controls', import.meta.url)),
    rubric,
    allEntries,
  );
  const forcedDevelopmentKeys = new Set([
    ...reviewed.rows.map((control) => control.row.entryKey),
    ...rubric.tags.flatMap((tag) =>
      tag.anchors.map(
        (anchor) =>
          resolveEntryReference(allEntries, anchor.entryReference).entry.key,
      ),
    ),
  ]);
  const families = buildConceptFamilies(allEntries, forcedDevelopmentKeys);
  const rubricHash = hashCanonical(rubric);
  const selectionSeed = sha256(
    `${compiled.dataset.contentVersion}\0${rubricHash}\0synac-reference-selection-v1`,
  );
  const split = buildSplitPlan(families, selectionSeed);
  const selectedEntries = selectSplitEntries(allEntries, split);
  const corpus = corpusSnapshot(
    compiled.dataset.contentVersion,
    selectedEntries,
  );
  const controls = buildControls(
    rubric,
    selectedEntries,
    selectionSeed,
    reviewed,
  );
  const injections = buildInjectionPackets(rubric);
  await validatePublicBenchmark(
    path.join(
      input.repositoryRoot,
      'experiments',
      'tagging',
      'served-model-bakeoff',
      'input.json',
    ),
    path.join(
      input.repositoryRoot,
      'experiments',
      'tagging',
      'served-model-bakeoff',
      'expected.json',
    ),
    rubric,
    controls,
  );
  validateCorpus(corpus);
  validateSplit(split, corpus, forcedDevelopmentKeys);
  validateControls(controls);
  validateInjectionSuite(injections);
  const manifest = await buildManifest({
    rubric,
    corpus,
    split,
    controls,
    injections,
    models,
    runtime,
    sourceDirectory: fileURLToPath(new URL('.', import.meta.url)),
    reviewedFiles: reviewed.files,
  });
  validateManifest(manifest);

  await mkdir(input.outputDirectory, { recursive: false });
  await writeJson(input.outputDirectory, 'rubric.json', rubric);
  await writeJson(input.outputDirectory, 'corpus.json', corpus);
  await writeJson(input.outputDirectory, 'split.json', split);
  await writeJson(input.outputDirectory, 'controls.json', controls);
  await writeJson(input.outputDirectory, 'injection-packets.json', injections);
  await writeJson(input.outputDirectory, 'manifest.json', manifest);
  const shortfall = controls.perTag.reduce(
    (total, report) =>
      total + report.positiveShortfall + report.negativeShortfall,
    0,
  );
  return {
    manifestHash: manifest.manifestHash,
    corpusHash: corpus.corpusHash,
    controlShortfall: shortfall,
    controlsReady: controls.protocolReady,
  };
}

async function main(): Promise<void> {
  const parsed = parseBuildOptions(process.argv.slice(2));
  const models = await jsonFile(parsed.models, validateModelLineages);
  const runtime = await jsonFile(parsed.runtime, validateRuntimeConfig);
  const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const result = await buildReferenceArtifacts({
    repositoryRoot,
    outputDirectory: parsed.output,
    models,
    runtime,
  });
  console.log(
    JSON.stringify({
      ...result,
      shortfallByTag: controlShortfall(
        await jsonFile(
          path.join(parsed.output, 'controls.json'),
          validateControls,
        ),
      ),
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
