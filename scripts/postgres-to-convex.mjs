#!/usr/bin/env node
import {
  parseCsvList,
  sourceTables,
  transformPostgresExport,
} from './lib/postgres-to-convex.mjs';

function usage() {
  return `Usage:
  node scripts/postgres-to-convex.mjs --input pg-export --output .migration/convex-import [options]

Options:
  --input <dir>                 Directory containing psql COPY exports.
  --output <dir>                Output directory for Convex import artifacts.
  --clerk-issuer-domain <url>   Populate users.tokenIdentifier as <issuer>|<providerSubject>.
  --admin-emails <csv>          Validate expected admin users.
  --zip                         Also create convex-import.zip if the zip command is available.
  --list-tables                 Print expected source tables and exit.
`;
}

function parseArgs(argv) {
  const out = { zip: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--zip') out.zip = true;
    else if (arg === '--list-tables') out.listTables = true;
    else if (arg === '--input') out.inputDir = argv[++index];
    else if (arg === '--output') out.outputDir = argv[++index];
    else if (arg === '--clerk-issuer-domain')
      out.clerkIssuerDomain = argv[++index];
    else if (arg === '--admin-emails')
      out.adminEmails = parseCsvList(argv[++index]);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  out.clerkIssuerDomain ??= process.env.CLERK_JWT_ISSUER_DOMAIN;
  out.adminEmails ??= parseCsvList(process.env.SYNAC_ADMIN_EMAILS);
  return out;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (args.listTables) {
    console.log(sourceTables().join('\n'));
    process.exit(0);
  }
  if (!args.inputDir || !args.outputDir)
    throw new Error('--input and --output are required');

  const result = await transformPostgresExport(args);
  console.log(`Wrote Convex import directory: ${result.importDir}`);
  if (result.zipPath) console.log(`Wrote Convex import zip: ${result.zipPath}`);
  console.log(
    `Validation: ${result.validation.errors.length} errors, ${result.validation.warnings.length} warnings`,
  );
  for (const [table, count] of Object.entries(result.validation.counts)) {
    if (count > 0) console.log(`${table}: ${count}`);
  }
  if (result.validation.errors.length > 0) {
    console.error('\nErrors:');
    for (const error of result.validation.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (result.validation.warnings.length > 0) {
    console.error('\nWarnings:');
    for (const warning of result.validation.warnings)
      console.error(`- ${warning}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exit(1);
}
