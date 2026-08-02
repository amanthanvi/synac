/**
 * Regenerates content/generated/<source>.json bundles from upstream sources.
 *
 * Usage:
 *   pnpm --filter @synac/ingest-tools ingest -- --source rfc4949
 *   pnpm --filter @synac/ingest-tools ingest -- --all
 *
 * Bundles are deterministic: a run against unchanged upstream content leaves
 * the files byte-identical, so the scheduled workflow only opens a PR when
 * something really changed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { bundleFileSchema, sourceFileSchema, type SourceFile } from '@synac/content-tools';

import type { Adapter } from './bundle.js';
import { runRfc4949 } from './adapters/rfc4949.js';
import { runNistGlossary } from './adapters/nistGlossary.js';
import { runNiccsGlossary } from './adapters/niccsGlossary.js';
import { runOwaspVulnerabilities } from './adapters/owaspVulnerabilities.js';
import { runMitreAttackCti } from './adapters/mitreAttackCti.js';

const ADAPTERS: Record<string, Adapter> = {
  rfc4949Glossary: runRfc4949,
  nistGlossary: runNistGlossary,
  niccsGlossary: runNiccsGlossary,
  owaspVulnerabilities: runOwaspVulnerabilities,
  mitreAttackCti: runMitreAttackCti,
};

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const contentDir = process.env.SYNAC_CONTENT_DIR ?? path.join(repoRoot, 'content');

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function loadSource(slug: string): Promise<SourceFile | null> {
  const raw = await readJson(path.join(contentDir, 'sources', `${slug}.json`));
  if (!raw) return null;
  return sourceFileSchema.parse(raw);
}

async function runSource(source: SourceFile): Promise<'updated' | 'unchanged' | 'skipped'> {
  if (!source.enabled || !source.ingest) return 'skipped';
  const adapter = ADAPTERS[source.ingest.adapter];
  if (!adapter) throw new Error(`${source.slug}: unknown adapter ${source.ingest.adapter}`);

  const bundlePath = path.join(contentDir, 'generated', `${source.slug}.json`);
  const previousRaw = await readJson(bundlePath);
  const previous = previousRaw ? bundleFileSchema.parse(previousRaw) : null;

  const bundle = await adapter({
    source,
    previous,
    maxItems: source.ingest.maxItems ?? 10000,
    now: new Date(),
  });

  if (previous && bundle === previous) return 'unchanged';
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return 'updated';
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const sourceFlag = args.indexOf('--source');
const requested = sourceFlag >= 0 ? args[sourceFlag + 1] : undefined;

if (!all && !requested) {
  console.error('usage: ingest --source <slug> | --all');
  process.exit(1);
}

const { readdir } = await import('node:fs/promises');
const slugs = all
  ? (await readdir(path.join(contentDir, 'sources'))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : [requested!];

let failures = 0;
for (const slug of slugs) {
  const source = await loadSource(slug);
  if (!source) {
    console.error(`✗ ${slug}: no source registry file`);
    failures += 1;
    continue;
  }
  try {
    const outcome = await runSource(source);
    console.log(`${outcome === 'updated' ? '✳' : '·'} ${slug}: ${outcome}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${slug}: ${(error as Error).message}`);
  }
}

if (failures > 0) process.exit(1);
