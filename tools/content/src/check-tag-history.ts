import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { tagAssignmentsFileSchema, type TagAssignmentsFile } from './model.js';
import { stableJsonHash } from './tagging.js';

const artifactPath = 'content/tag-assignments.json';

function pair(row: { entryKey: string; tagSlug: string }): string {
  return `${row.entryKey}\0${row.tagSlug}`;
}

export function validateAssignmentHistory(
  current: TagAssignmentsFile,
  previous: TagAssignmentsFile | undefined,
): string[] {
  const errors: string[] = [];
  if (!previous) {
    if (current.run.previousAssignmentsHash) {
      errors.push(
        'first assignment generation cannot declare previousAssignmentsHash',
      );
    }
    if (current.removals.length > 0)
      errors.push('first assignment generation cannot contain removals');
    return errors;
  }

  const previousHash = stableJsonHash(previous);
  if (current.run.previousAssignmentsHash !== previousHash) {
    errors.push(
      `previousAssignmentsHash ${current.run.previousAssignmentsHash ?? 'missing'} does not match ${previousHash}`,
    );
  }
  const currentPairs = new Set(current.assignments.map(pair));
  const previousByPair = new Map(
    previous.assignments.map((row) => [pair(row), row]),
  );
  const removalsByPair = new Map(
    current.removals.map((row) => [pair(row), row]),
  );
  for (const [identity, prior] of previousByPair) {
    if (currentPairs.has(identity)) continue;
    const removal = removalsByPair.get(identity);
    if (!removal) {
      errors.push(
        `silent assignment loss: ${prior.entryKey} -> ${prior.tagSlug}`,
      );
      continue;
    }
    if (removal.previousEntryContentHash !== prior.entryContentHash) {
      errors.push(
        `removal prior hash mismatch: ${prior.entryKey} -> ${prior.tagSlug}`,
      );
    }
    if (removal.runId !== current.run.runId) {
      errors.push(
        `removal foreign run ID: ${prior.entryKey} -> ${prior.tagSlug}`,
      );
    }
  }
  for (const [identity, removal] of removalsByPair) {
    if (!previousByPair.has(identity)) {
      errors.push(
        `spurious removal: ${removal.entryKey} -> ${removal.tagSlug}`,
      );
    } else if (currentPairs.has(identity)) {
      errors.push(
        `pair is both assigned and removed: ${removal.entryKey} -> ${removal.tagSlug}`,
      );
    }
  }
  return errors;
}

function git(args: string[], allowFailure = false): string | undefined {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) return result.stdout.trim();
  if (allowFailure) return undefined;
  throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
}

function parseArtifact(raw: string, label: string): TagAssignmentsFile {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
  const parsed = tagAssignmentsFileSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${label}: ${parsed.error.message}`);
  return parsed.data;
}

const repoRoot = path.resolve(import.meta.dirname, '../../..');

export function resolveBaseRef(
  argv: string[],
  configuredBase: string | undefined,
): string {
  const baseIndex = argv.indexOf('--base');
  const baseArg = baseIndex >= 0 ? argv[baseIndex + 1]?.trim() : undefined;
  if (baseIndex >= 0 && !baseArg) throw new Error('--base requires a Git ref');
  return (baseArg ?? configuredBase?.trim()) || 'HEAD';
}

async function main(): Promise<void> {
  const base = resolveBaseRef(
    process.argv,
    process.env.SYNAC_ASSIGNMENTS_BASE_REF,
  );
  const changed = git(['diff', '--name-only', base, '--', artifactPath]);
  if (!changed) {
    console.log(
      `tag assignment history ok: ${artifactPath} unchanged from ${base}`,
    );
    return;
  }

  const currentRaw = await readFile(path.join(repoRoot, artifactPath), 'utf8');
  const current = parseArtifact(currentRaw, artifactPath);
  const previousRaw = git(['show', `${base}:${artifactPath}`], true);
  const previous = previousRaw
    ? parseArtifact(previousRaw, `${base}:${artifactPath}`)
    : undefined;
  const errors = validateAssignmentHistory(current, previous);
  if (errors.length > 0) {
    for (const error of errors) console.error(`  ✗ ${error}`);
    throw new Error(
      `tag assignment history failed with ${errors.length} error(s)`,
    );
  }
  console.log(
    `tag assignment history ok: ${current.assignments.length} assignments, ${current.removals.length} reviewed removals`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  await main();
}
