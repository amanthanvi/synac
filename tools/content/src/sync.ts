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
import type { CompiledDataset, CompiledSense } from './model.js';

const ENTRY_CHUNK = 25;
const RELATIONSHIP_CHUNK = 200;

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const prod = process.argv.includes('--prod');

function runConvex(fn: string, args: unknown): void {
  const cliArgs = ['convex', 'run', fn, JSON.stringify(args), ...(prod ? ['--prod'] : [])];
  const result = spawnSync('npx', cliArgs, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`npx convex run ${fn} failed:\n${result.stderr?.toString() ?? ''}`);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pushDataset(dataset: CompiledDataset): void {
  const syncVersion = dataset.contentVersion;
  const sensesByEntry = new Map<string, CompiledSense[]>();
  for (const sense of dataset.senses) {
    const list = sensesByEntry.get(sense.entryKey) ?? [];
    list.push(sense);
    sensesByEntry.set(sense.entryKey, list);
  }

  runConvex('sync:upsertSources', { syncVersion, rows: stripUndefined(dataset.sources) });
  runConvex('sync:upsertTags', { syncVersion, rows: stripUndefined(dataset.tags) });

  const entryRows = dataset.entries.map((entry) => ({
    ...entry,
    senses: (sensesByEntry.get(entry.key) ?? []).map(({ entryKey: _entryKey, ...sense }) => sense),
  }));
  for (const [index, rows] of chunk(entryRows, ENTRY_CHUNK).entries()) {
    runConvex('sync:upsertEntries', { syncVersion, rows: stripUndefined(rows) });
    console.log(`entries: chunk ${index + 1} pushed (${rows.length} rows)`);
  }

  for (const rows of chunk(dataset.relationships, RELATIONSHIP_CHUNK)) {
    runConvex('sync:upsertRelationships', { syncVersion, rows: stripUndefined(rows) });
  }
  runConvex('sync:upsertRedirects', { syncVersion, rows: stripUndefined(dataset.redirects) });
  runConvex('sync:finish', { syncVersion, entryCount: dataset.entries.length });
}

const contentDir = process.env.SYNAC_CONTENT_DIR ?? path.join(repoRoot, 'content');
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

const status = spawnSync(
  'npx',
  ['convex', 'run', 'sync:status', '{}', ...(prod ? ['--prod'] : [])],
  { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
);
console.log(`sync status: ${status.stdout?.toString().trim()}`);
