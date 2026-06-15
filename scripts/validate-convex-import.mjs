#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import {
  parseCsvList,
  readConvexImportDirectory,
  validateConvexRows,
} from './lib/postgres-to-convex.mjs';

function usage() {
  return `Usage:
  node scripts/validate-convex-import.mjs --input .migration/convex-import/convex-import [options]

Options:
  --input <dir>          Directory containing Convex <table>/documents.jsonl files, or its parent.
  --admin-emails <csv>   Expected ADMIN allowlist emails.
  --report <file>        Write validation JSON report.
`;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') out.inputDir = argv[++index];
    else if (arg === '--admin-emails')
      out.adminEmails = parseCsvList(argv[++index]);
    else if (arg === '--report') out.report = argv[++index];
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  out.adminEmails ??= parseCsvList(process.env.SYNAC_ADMIN_EMAILS);
  return out;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!args.inputDir) throw new Error('--input is required');

  const rowsByTable = await readConvexImportDirectory(args.inputDir);
  const report = validateConvexRows(rowsByTable, {
    adminEmails: args.adminEmails,
  });
  if (args.report)
    await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `Validation: ${report.errors.length} errors, ${report.warnings.length} warnings`,
  );
  for (const [table, count] of Object.entries(report.counts)) {
    if (count > 0) console.log(`${table}: ${count}`);
  }
  if (report.errors.length > 0) {
    console.error('\nErrors:');
    for (const error of report.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (report.warnings.length > 0) {
    console.error('\nWarnings:');
    for (const warning of report.warnings) console.error(`- ${warning}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exit(1);
}
