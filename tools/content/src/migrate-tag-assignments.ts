import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compileContent, type ContentInput } from './compile.js';
import { loadContentDir } from './load.js';
import {
  tagAssignmentsFileV2Schema,
  type TagAssignmentsFileV1,
  type TagAssignmentsFileV2,
} from './model.js';
import {
  classificationEntryHashes,
  corpusHashFromEntryHashes,
  stableJsonHash,
} from './tagging.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

/**
 * Rewrites a schemaVersion 1 artifact as schemaVersion 2. Version 1 kept only
 * a hash over the classified corpus, so the per-entry hashes come from the
 * live corpus, and only when they reproduce that hash exactly; anything less
 * would guess at what the run saw.
 */
export function migrateTagAssignments(
  legacy: TagAssignmentsFileV1,
  liveEntryHashes: Readonly<Record<string, string>>,
): TagAssignmentsFileV2 {
  const { runId } = legacy.run;
  const liveCorpusHash = corpusHashFromEntryHashes(liveEntryHashes);
  if (liveCorpusHash !== legacy.run.corpusHash) {
    throw new Error(
      `the live corpus (${liveCorpusHash}) is not the corpus run ${runId} classified (${legacy.run.corpusHash}); ` +
        'migrate from the commit the run classified, or emit a fresh release',
    );
  }
  for (const row of legacy.assignments) {
    if (liveEntryHashes[row.entryKey] !== row.entryContentHash) {
      throw new Error(
        `${row.entryKey} -> ${row.tagSlug} does not match the hash run ${runId} classified`,
      );
    }
  }
  // Removal records are bound to the legacy artifact's own predecessor. The
  // migrated artifact's predecessor is the legacy artifact, which it keeps
  // whole, so those records would read as spurious.
  if (legacy.removals.length > 0) {
    throw new Error(
      `run ${runId} carries removal records; emit a fresh release instead`,
    );
  }
  const {
    model,
    modelHash,
    promptHash,
    configHash,
    calibrationHash,
    certificationHash,
    thresholds,
    thresholdsHash,
    labelOrigin,
    createdAt,
    release,
  } = legacy.run;
  return tagAssignmentsFileV2Schema.parse({
    schemaVersion: 2,
    taxonomyVersion: legacy.taxonomyVersion,
    taxonomyHash: legacy.taxonomyHash,
    run: {
      runId,
      model,
      modelHash,
      promptHash,
      configHash,
      calibrationHash,
      certificationHash,
      thresholds,
      thresholdsHash,
      previousAssignmentsHash: stableJsonHash(legacy),
      labelOrigin,
      createdAt,
      release,
    },
    assignments: legacy.assignments,
    removals: [],
    classifiedEntries: liveEntryHashes,
  });
}

/** Migrates `legacy` against `input` and proves the result compiles strictly. */
export function migrateContent(
  input: ContentInput,
  legacy: TagAssignmentsFileV1,
): TagAssignmentsFileV2 {
  const live = compileContent(
    { ...input, tagAssignments: undefined },
    { allowUnreleasedTagging: true },
  );
  if (!live.ok) throw new Error(live.errors.join('\n'));
  const migrated = migrateTagAssignments(
    legacy,
    classificationEntryHashes(
      live.classification.entries,
      live.classification.senses,
    ),
  );
  const verified = compileContent(
    { ...input, tagAssignments: migrated },
    { strictTagging: true },
  );
  if (!verified.ok) {
    throw new Error(
      `the migrated artifact fails strict compile:\n${verified.errors.join('\n')}`,
    );
  }
  return migrated;
}

async function main(): Promise<void> {
  const contentDir =
    process.env.SYNAC_CONTENT_DIR ?? path.join(repoRoot, 'content');
  const loaded = await loadContentDir(contentDir);
  if (!loaded.ok) throw new Error(loaded.errors.join('\n'));
  const legacy = loaded.input.tagAssignments;
  if (legacy?.schemaVersion !== 1) {
    console.log(
      legacy
        ? 'tag assignments already use schemaVersion 2; nothing to migrate'
        : 'no tag-assignments.json; nothing to migrate',
    );
    return;
  }
  const migrated = migrateContent(loaded.input, legacy);
  const outPath = path.join(contentDir, 'tag-assignments.json');
  await writeFile(outPath, `${JSON.stringify(migrated, null, 2)}\n`);
  console.log(
    `migrated ${outPath} to schemaVersion 2: ${migrated.assignments.length} assignments, ` +
      `${Object.keys(migrated.classifiedEntries).length} classified entries`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  await main();
}
