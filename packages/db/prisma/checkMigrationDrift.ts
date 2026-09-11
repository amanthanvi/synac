/**
 * Fails when `schema.prisma` and `prisma/migrations` disagree, except for the
 * raw-SQL objects Prisma cannot express (documented at the top of schema.prisma).
 *
 * Usage: SHADOW_DATABASE_URL=... pnpm --filter @synac/db db:migrate:drift
 */
import { spawnSync } from 'node:child_process';

const ALLOWLIST: RegExp[] = [
  // partial unique indexes (WHERE deleted_at IS NULL)
  /DROP INDEX "entries_entry_type_normalized_title_active_key";/,
  /DROP INDEX "entries_entry_type_primary_slug_active_key";/,
  /DROP INDEX "entry_relationships_from_to_type_active_key";/,
  /DROP INDEX "senses_entry_id_slug_active_key";/,
  /DROP INDEX "tags_slug_active_key";/,
  // text_pattern_ops indexes are declared in SQL only
  /CREATE INDEX "entry_search_normalized_title_pattern_idx" ON "entry_search"\("normalized_title" text_pattern_ops\);/,
  /CREATE INDEX "entry_search_primary_slug_pattern_idx" ON "entry_search"\("primary_slug" text_pattern_ops\);/,
  // historical name mismatch from the init migration
  /ALTER INDEX "takedown_cases_created_at_desc_idx" RENAME TO "takedown_cases_created_at_idx";/,
];

const shadow = process.env.SHADOW_DATABASE_URL?.trim();
if (!shadow) {
  console.error('SHADOW_DATABASE_URL is required (an empty scratch database).');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-migrations',
    'prisma/migrations',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
  ],
  { encoding: 'utf8', env: process.env },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const statements = result.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(
    (line) =>
      line &&
      !line.startsWith('--') &&
      !line.startsWith('npm notice') &&
      !line.includes('dotenv'),
  );

const unexpected = statements.filter(
  (stmt) => !ALLOWLIST.some((re) => re.test(stmt)),
);

if (unexpected.length > 0) {
  console.error('Migration drift detected. Unexpected statements:\n');
  for (const stmt of unexpected) console.error(`  ${stmt}`);
  console.error(
    '\nEither add a migration or update the allowlist in prisma/checkMigrationDrift.ts.',
  );
  process.exit(2);
}

console.log(
  `Migration drift check passed (${statements.length} allowlisted statement(s)).`,
);
