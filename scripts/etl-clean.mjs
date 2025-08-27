/**
 * scripts/etl-clean.mjs
 * Remove ETL artifacts safely.
 *
 * Deletes:
 * - data/vendor (cached upstream artifacts)
 * - data/raw (normalized JSON + meta)
 * - data/build (merged canonical outputs)
 *
 * Entry guard follows the isMain pattern used across scripts.
 */
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function safeRm(p) {
  try {
    await rm(p, { recursive: true, force: true });
    console.log(`[etl:clean] removed ${p}`);
  } catch (e) {
    console.warn(`[etl:clean] skip ${p}: ${e?.message || e}`);
  }
}

async function main() {
  const root = join(__dirname, '..');
  await safeRm(join(root, 'data', 'vendor'));
  await safeRm(join(root, 'data', 'raw'));
  await safeRm(join(root, 'data', 'build'));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
