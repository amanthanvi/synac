import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compileContent } from './compile.js';
import { loadContentDir } from './load.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const contentDir = process.env.SYNAC_CONTENT_DIR ?? path.join(repoRoot, 'content');
const emit = process.argv.includes('--emit');

const loaded = await loadContentDir(contentDir);
if (!loaded.ok) {
  console.error(`content check failed: ${loaded.errors.length} schema error(s)\n`);
  for (const error of loaded.errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

const result = compileContent(loaded.input);
for (const warning of result.warnings) console.warn(`  ⚠ ${warning}`);
if (!result.ok) {
  console.error(`content check failed: ${result.errors.length} error(s)\n`);
  for (const error of result.errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

const { dataset } = result;
console.log(
  `content ok: ${dataset.entries.length} entries, ${dataset.senses.length} senses, ` +
    `${dataset.tags.length} tags, ${dataset.sources.length} sources, ` +
    `${dataset.relationships.length} relationships (version ${dataset.contentVersion.slice(0, 12)})`,
);

if (emit) {
  const outPath = path.join(repoRoot, 'tools/content/dist/compiled.json');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(dataset, null, 2));
  console.log(`compiled dataset written to ${path.relative(repoRoot, outPath)}`);
}
