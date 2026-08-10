import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { canonicalJson } from './canonical.ts';
import type { ControlSuite, FrozenRubric } from './types.ts';

function legacySha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path}: must be an object`);
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: must be an array`);
  return value;
}

async function parse(filePath: string): Promise<Record<string, unknown>> {
  try {
    return object(JSON.parse(await readFile(filePath, 'utf8')), filePath);
  } catch (error) {
    throw new Error(`${filePath}: cannot read benchmark JSON`, {
      cause: error,
    });
  }
}

export async function validatePublicBenchmark(
  inputPath: string,
  expectedPath: string,
  rubric: FrozenRubric,
  controls: ControlSuite,
): Promise<void> {
  const input = await parse(inputPath);
  const expected = await parse(expectedPath);
  if (
    input.schemaVersion !== 'synac-served-model-anchor-v2' ||
    expected.schemaVersion !== input.schemaVersion
  ) {
    throw new Error(
      'public benchmark schema must be synac-served-model-anchor-v2',
    );
  }
  if (input.taxonomyVersion !== '2')
    throw new Error('public benchmark taxonomyVersion must be 2');
  if (
    typeof input.benchmarkHash !== 'string' ||
    input.benchmarkHash !== expected.benchmarkHash
  ) {
    throw new Error('public benchmark input/expected hashes disagree');
  }
  const { benchmarkHash: _benchmarkHash, ...inputCore } = input;
  if (legacySha256(JSON.stringify(inputCore)) !== input.benchmarkHash)
    throw new Error('public benchmark input hash is invalid');

  const contracts = list(input.contracts, 'public input.contracts');
  if (contracts.length !== rubric.tags.length)
    throw new Error('public benchmark must contain exactly 11 contracts');
  rubric.tags.forEach((tag, index) => {
    const contract = object(
      contracts[index],
      `public input.contracts[${index}]`,
    );
    const expectedContract = {
      slug: tag.slug,
      name: tag.name,
      definition: tag.definition,
      inclusionRules: tag.inclusionRules.map((rule) => rule.text),
      exclusionRules: tag.exclusionRules.map((rule) => rule.text),
    };
    if (canonicalJson(contract) !== canonicalJson(expectedContract)) {
      throw new Error(
        `public benchmark contract ${tag.slug} drifted from frozen rubric`,
      );
    }
  });

  const expectedCases = new Map(
    list(expected.cases, 'public expected.cases').map((caseValue, index) => {
      const benchmarkCase = object(
        caseValue,
        `public expected.cases[${index}]`,
      );
      if (typeof benchmarkCase.caseId !== 'string')
        throw new Error(`public expected.cases[${index}].caseId: invalid`);
      if (
        benchmarkCase.label !== 'applicable' &&
        benchmarkCase.label !== 'not_applicable'
      ) {
        throw new Error(`public expected.cases[${index}].label: invalid`);
      }
      return [benchmarkCase.caseId, benchmarkCase.label] as const;
    }),
  );
  const tagIdBySlug = new Map(rubric.tags.map((tag) => [tag.slug, tag.id]));
  const observed = list(input.cases, 'public input.cases').map(
    (caseValue, index) => {
      const benchmarkCase = object(caseValue, `public input.cases[${index}]`);
      if (
        typeof benchmarkCase.caseId !== 'string' ||
        typeof benchmarkCase.contractSlug !== 'string'
      ) {
        throw new Error(`public input.cases[${index}]: invalid identity`);
      }
      const entry = object(
        benchmarkCase.entry,
        `public input.cases[${index}].entry`,
      );
      if (typeof entry.key !== 'string')
        throw new Error(`public input.cases[${index}].entry.key: invalid`);
      const tagId = tagIdBySlug.get(benchmarkCase.contractSlug);
      const label = expectedCases.get(benchmarkCase.caseId);
      if (!tagId || !label)
        throw new Error(
          `public input.cases[${index}]: unresolved tag or expected label`,
        );
      return `${tagId}\0${entry.key}\0${label}`;
    },
  );
  const controlsIndex = controls.controls
    .filter((control) => control.evidenceKind === 'public-rubric-anchor')
    .map(
      (control) => `${control.tagId}\0${control.entryKey}\0${control.label}`,
    );
  if (
    observed.length !== 110 ||
    expectedCases.size !== 110 ||
    new Set(observed).size !== 110
  ) {
    throw new Error(
      'public benchmark must contain exactly 110 unique labeled anchors',
    );
  }
  if (
    canonicalJson([...observed].sort()) !==
    canonicalJson([...controlsIndex].sort())
  ) {
    throw new Error(
      'source-backed controls drifted from public input/expected labels',
    );
  }
}
