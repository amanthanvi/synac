/**
 * Pushes the compiled content/ dataset into a Convex deployment through the
 * internal sync mutations, then prints the deployment's sync status.
 *
 * Usage: tsx src/sync.ts [--prod]
 *   - locally: uses the deployment configured by `npx convex dev` (.env.local)
 *   - in CI:   set CONVEX_DEPLOY_KEY and pass --prod
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { compileContent } from './compile.js';
import { loadContentDir } from './load.js';
import type { CompiledDataset } from './model.js';
import {
  createSyncPlan,
  isSyncCommitApplied,
  isSyncConverged,
  stripUndefined,
  type SyncBatchKind,
} from './sync-plan.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const prod = process.argv.includes('--prod');

function runConvex(
  fn: string,
  args: unknown,
  options: { reconcile?: () => boolean } = {},
): string {
  const cliArgs = [
    'convex',
    'run',
    fn,
    JSON.stringify(args),
    ...(prod ? ['--prod'] : []),
  ];
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync('npx', cliArgs, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0) return result.stdout?.toString().trim() ?? '';
    lastError = result.stderr?.toString() ?? '';
    if (options.reconcile) {
      try {
        if (options.reconcile()) return '';
      } catch (error) {
        lastError += `\nreconciliation failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (attempt < 3)
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        attempt * 1_000,
      );
  }
  throw new Error(
    `npx convex run ${fn} failed after 3 attempts:\n${lastError}`,
  );
}

const SYNC_FUNCTIONS: Record<SyncBatchKind, string> = {
  sources: 'sync:upsertSources',
  tags: 'sync:upsertTags',
  entries: 'sync:upsertEntries',
  relationships: 'sync:upsertRelationships',
  redirects: 'sync:upsertRedirects',
  tagRedirects: 'sync:upsertTagRedirects',
};

function pushDataset(dataset: CompiledDataset): void {
  const plan = createSyncPlan(dataset);
  const begin = convexJson<{
    alreadyCurrent: boolean;
    nextBatchOrdinal: number;
  }>('sync:begin', {
    syncVersion: plan.syncVersion,
    manifestHash: plan.manifestHash,
    batchHashes: plan.batchHashes,
    expectedCounts: plan.expectedCounts,
    expectedTagCounts: plan.expectedTagCounts,
    expectedSourceCounts: plan.expectedSourceCounts,
  });
  if (begin.alreadyCurrent) return;
  if (
    begin.nextBatchOrdinal < 0 ||
    begin.nextBatchOrdinal > plan.batches.length
  ) {
    throw new Error(
      `pending sync returned invalid next batch ordinal ${begin.nextBatchOrdinal}`,
    );
  }
  let entryChunk = plan.batches
    .slice(0, begin.nextBatchOrdinal)
    .filter((batch) => batch.kind === 'entries').length;
  for (
    let ordinal = begin.nextBatchOrdinal;
    ordinal < plan.batches.length;
    ordinal += 1
  ) {
    const batch = plan.batches[ordinal];
    if (!batch) throw new Error(`sync plan batch ${ordinal} is missing`);
    runConvex(SYNC_FUNCTIONS[batch.kind], {
      syncVersion: plan.syncVersion,
      manifestHash: plan.manifestHash,
      ordinal,
      batchHash: batch.hash,
      rows: stripUndefined(batch.rows),
    });
    if (batch.kind === 'entries') {
      entryChunk += 1;
      console.log(
        `entries: chunk ${entryChunk} pushed (${batch.rows.length} rows)`,
      );
    }
  }
  runConvex(
    'sync:commit',
    {
      syncVersion: plan.syncVersion,
      manifestHash: plan.manifestHash,
    },
    {
      reconcile: () =>
        isSyncCommitApplied(
          convexJson<{ contentVersion?: string }>('sync:status', {}),
          plan.syncVersion,
        ),
    },
  );
}

function waitForConvergence(expectedVersion: string): string {
  const attempts = 120;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const raw = runConvex('sync:status', {});
    const status = JSON.parse(raw) as {
      contentVersion?: string;
      prunePending?: boolean;
    };
    if (status.contentVersion !== expectedVersion) {
      throw new Error(
        `sync status version ${status.contentVersion ?? 'missing'} does not match ${expectedVersion}`,
      );
    }
    if (isSyncConverged(status)) return raw;
    if (attempt < attempts)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  throw new Error(
    'content sync did not finish stale-row pruning within 120 seconds',
  );
}

function convexJson<T>(fn: string, args: unknown): T {
  const raw = runConvex(fn, args);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${fn}: Convex CLI returned non-JSON output`, {
      cause: error,
    });
  }
}

function verifyTagConvergence(dataset: CompiledDataset): void {
  const actualTags = convexJson<Array<{ slug: string; entryCount: number }>>(
    'tags:directory',
    {},
  );
  const expectedBySlug = new Map(
    dataset.tags.map((tag) => [tag.slug, tag.entryCount]),
  );
  if (actualTags.length !== dataset.tags.length) {
    throw new Error(
      `production tag count ${actualTags.length} does not match compiled count ${dataset.tags.length}`,
    );
  }
  for (const tag of actualTags) {
    const expectedCount = expectedBySlug.get(tag.slug);
    if (expectedCount === undefined || expectedCount !== tag.entryCount) {
      throw new Error(
        `production tag ${tag.slug} declares ${tag.entryCount}; compiled dataset declares ${expectedCount ?? 'missing'}`,
      );
    }
    const entryKeys = new Set<string>();
    for (let page = 1; page <= 100; page += 1) {
      const result = convexJson<{
        entries: Array<{ key: string }>;
        hasMore: boolean;
      }>('tags:entriesForTag', {
        tagSlug: tag.slug,
        entryType: null,
        page,
        pageSize: 100,
      });
      for (const entry of result.entries) {
        if (entryKeys.has(entry.key))
          throw new Error(
            `production tag ${tag.slug} repeats entry ${entry.key}`,
          );
        entryKeys.add(entry.key);
      }
      if (!result.hasMore) break;
      if (page === 100)
        throw new Error(
          `production tag ${tag.slug} exceeds the supported 10,000-entry verification bound`,
        );
    }
    if (entryKeys.size !== expectedCount) {
      throw new Error(
        `production tag ${tag.slug} enumerates ${entryKeys.size}; expected ${expectedCount}`,
      );
    }
  }
}

const contentDir =
  process.env.SYNAC_CONTENT_DIR ?? path.join(repoRoot, 'content');
const loaded = await loadContentDir(contentDir);
if (!loaded.ok) {
  for (const error of loaded.errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
const result = compileContent(loaded.input);
if (!result.ok) {
  for (const error of result.errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(
  `syncing ${result.dataset.entries.length} entries (version ${result.dataset.contentVersion.slice(0, 12)}) ` +
    `to ${prod ? 'production' : 'the local dev deployment'}`,
);
pushDataset(result.dataset);
console.log(
  `sync status: ${waitForConvergence(result.dataset.contentVersion)}`,
);
verifyTagConvergence(result.dataset);
console.log('tag convergence: verified');
