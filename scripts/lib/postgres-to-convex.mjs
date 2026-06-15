import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const DATE_FIELDS = new Set([
  'accessedAt',
  'closedAt',
  'createdAt',
  'deletedAt',
  'doNotUseAt',
  'extractedAt',
  'fetchedAt',
  'finishedAt',
  'firstSeenAt',
  'lastLoginAt',
  'lastSeenAt',
  'lastVerifiedAt',
  'publishedAt',
  'startedAt',
  'updatedAt',
  'windowStart',
]);

const JSON_FIELDS = new Set([
  'actions',
  'affectedEntityIds',
  'after',
  'before',
  'configSnapshot',
  'diff',
  'proposedChange',
  'rateLimitPolicy',
  'sourceLocator',
  'stageOutputs',
  'stats',
]);

const BOOLEAN_FIELDS = new Set([
  'doNotUse',
  'enabled',
  'isEditorial',
  'isPreferred',
  'snapshotAllowed',
]);
const NUMBER_FIELDS = new Set([
  'confidenceScore',
  'count',
  'exampleOrder',
  'senseOrder',
  'weight',
]);

const SOURCE_TABLES = [
  'roles',
  'users',
  'user_roles',
  'entries',
  'entry_slug_history',
  'entry_variants',
  'senses',
  'sense_examples',
  'tags',
  'tag_slug_history',
  'entry_tags',
  'entry_relationships',
  'sources',
  'source_documents',
  'citations',
  'field_provenance',
  'entry_search',
  'entry_views',
  'ingest_runs',
  'ingest_items',
  'audit_events',
  'takedown_cases',
  'rate_limit_buckets',
];

export const TABLE_MAPPINGS = [
  map('roles', 'roles', ['id', 'name']),
  map('users', 'users', [
    'id',
    'email',
    'display_name',
    'auth_provider',
    'provider_subject',
    'token_identifier',
    'status',
    'created_at',
    'last_login_at',
  ]),
  map('user_roles', 'userRoles', ['id', 'user_id', 'role_id'], {
    id: (row) => stableCompositeId('userRoles', row.user_id, row.role_id),
  }),
  map('entries', 'entries', [
    'id',
    'entry_type',
    'display_title',
    'normalized_title',
    'primary_slug',
    'status',
    'summary_md',
    'summary_text',
    'editorial_notes',
    'created_at',
    'updated_at',
    'published_at',
    'created_by_user_id',
    'updated_by_user_id',
    'deleted_at',
  ]),
  map('entry_slug_history', 'entrySlugHistory', [
    'id',
    'entry_id',
    'entry_type',
    'slug',
    'created_at',
  ]),
  map('entry_variants', 'entryVariants', [
    'id',
    'entry_id',
    'variant_text',
    'normalized_variant',
    'variant_type',
    'created_at',
  ]),
  map('senses', 'senses', [
    'id',
    'entry_id',
    'sense_order',
    'sense_label',
    'definition_md',
    'definition_text',
    'expanded_form',
    'origin_language',
    'temporal_context',
    'is_editorial',
    'editorial_rationale',
    'is_preferred',
    'status',
    'created_at',
    'updated_at',
    'published_at',
    'deleted_at',
  ]),
  map('sense_examples', 'senseExamples', [
    'id',
    'sense_id',
    'example_md',
    'example_text',
    'example_order',
  ]),
  map('tags', 'tags', [
    'id',
    'name',
    'slug',
    'description',
    'created_at',
    'updated_at',
    'deleted_at',
  ]),
  map('tag_slug_history', 'tagSlugHistory', [
    'id',
    'tag_id',
    'slug',
    'created_at',
  ]),
  map('entry_tags', 'entryTags', ['id', 'entry_id', 'tag_id'], {
    id: (row) => stableCompositeId('entryTags', row.entry_id, row.tag_id),
  }),
  map('entry_relationships', 'entryRelationships', [
    'id',
    'from_entry_id',
    'to_entry_id',
    'relationship_type',
    'weight',
    'created_at',
    'created_by_user_id',
    'deleted_at',
  ]),
  map('sources', 'sources', [
    'id',
    'name',
    'source_slug',
    'base_url',
    'cron_schedule',
    'license_type',
    'license_notes',
    'allowed_use',
    'attribution_requirements',
    'access_method',
    'robots_policy',
    'rate_limit_policy',
    'contact',
    'last_verified_at',
    'trust_tier',
    'enabled',
    'notes_internal',
    'created_at',
    'updated_at',
  ]),
  map('source_documents', 'sourceDocuments', [
    'id',
    'source_id',
    'url',
    'canonical_url',
    'title',
    'content_type',
    'etag',
    'last_modified',
    'fetched_at',
    'content_sha256',
    'snapshot_storage_uri',
    'snapshot_allowed',
    'do_not_use',
    'do_not_use_reason',
    'do_not_use_at',
    'do_not_use_by_user_id',
    'deleted_at',
  ]),
  map('citations', 'citations', [
    'id',
    'source_id',
    'source_document_id',
    'url',
    'citation_text',
    'license_note',
    'attribution_text',
    'accessed_at',
  ]),
  map('field_provenance', 'fieldProvenance', [
    'id',
    'entity_type',
    'entity_id',
    'field_name',
    'citation_id',
    'content_mode',
    'extraction_method',
    'extractor_version',
    'extracted_at',
    'source_locator',
  ]),
  map(
    'entry_search',
    'entrySearch',
    [
      'id',
      'entry_id',
      'entry_type',
      'normalized_title',
      'primary_slug',
      'search_document',
      'updated_at',
    ],
    {
      id: (row) => row.id ?? row.entry_id,
    },
  ),
  map('entry_views', 'entryViews', [
    'id',
    'entry_id',
    'session_hash',
    'first_seen_at',
    'last_seen_at',
  ]),
  map('ingest_runs', 'ingestRuns', [
    'id',
    'source_id',
    'started_at',
    'finished_at',
    'status',
    'triggered_by',
    'triggered_by_user_id',
    'config_snapshot',
    'stats',
  ]),
  map('ingest_items', 'ingestItems', [
    'id',
    'ingest_run_id',
    'source_document_id',
    'item_key',
    'stage',
    'proposed_change',
    'stage_outputs',
    'diff',
    'confidence_score',
    'license_gate',
    'license_gate_reason',
    'error',
  ]),
  map('audit_events', 'auditEvents', [
    'id',
    'actor_user_id',
    'action',
    'entity_type',
    'entity_id',
    'before',
    'after',
    'created_at',
    'request_id',
    'ip_hash',
  ]),
  map('takedown_cases', 'takedownCases', [
    'id',
    'status',
    'source_id',
    'source_document_id',
    'entry_id',
    'requester_contact',
    'request_text',
    'internal_notes',
    'actions',
    'affected_entity_ids',
    'created_at',
    'updated_at',
    'closed_at',
    'created_by_user_id',
  ]),
  map('rate_limit_buckets', 'rateLimitBuckets', [
    'id',
    'scope',
    'key',
    'window_start',
    'count',
    'created_at',
    'updated_at',
  ]),
];

export const TARGET_TABLES = TABLE_MAPPINGS.map(
  (mapping) => mapping.targetTable,
);

function map(sourceTable, targetTable, columns, computed = {}) {
  return { sourceTable, targetTable, columns, computed };
}

function stableCompositeId(prefix, ...parts) {
  const digest = createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\0'))
    .digest('hex');
  return `${prefix}:${digest.slice(0, 32)}`;
}

function camelCase(value) {
  return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function normalizeKeyedRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value;
    out[camelCase(key)] = value;
  }
  return out;
}

function coerceValue(field, value) {
  if (value === undefined || value === '') return null;
  if (value === null) return null;
  if (DATE_FIELDS.has(field)) return coerceDate(value);
  if (JSON_FIELDS.has(field)) return coerceJson(value);
  if (BOOLEAN_FIELDS.has(field)) return coerceBoolean(value);
  if (NUMBER_FIELDS.has(field)) return coerceNumber(value);
  return value;
}

function coerceDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
}

function coerceJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  return JSON.parse(String(value));
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['t', 'true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['f', 'false', '0', 'no', 'n'].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid number: ${value}`);
  return parsed;
}

function transformRow(mapping, sourceRow, options) {
  const keyed = normalizeKeyedRow(sourceRow);
  const out = {};
  for (const sourceColumn of mapping.columns) {
    const targetField = camelCase(sourceColumn);
    const value =
      mapping.computed[targetField]?.(keyed, options) ??
      keyed[sourceColumn] ??
      keyed[targetField];
    out[targetField] = coerceValue(targetField, value);
  }

  if (mapping.targetTable === 'users') {
    out.email = String(out.email ?? '')
      .trim()
      .toLowerCase();
    out.authProvider ??= 'OIDC';
    out.status ??= 'ACTIVE';
    out.tokenIdentifier ??= tokenIdentifierForUser(
      out,
      options.clerkIssuerDomain,
    );
  }
  if (mapping.targetTable === 'senses') {
    out.isEditorial ??= false;
    out.isPreferred ??= false;
  }
  if (mapping.targetTable === 'sourceDocuments') {
    out.doNotUse ??= false;
  }
  if (mapping.targetTable === 'fieldProvenance') {
    out.contentMode ??= 'SUMMARIZED';
  }
  if (mapping.targetTable === 'entryRelationships') {
    out.weight ??= 0;
  }

  return stripUndefined(out);
}

function tokenIdentifierForUser(user, clerkIssuerDomain) {
  if (
    !clerkIssuerDomain ||
    !user.providerSubject ||
    user.authProvider !== 'OIDC'
  )
    return null;
  return `${String(clerkIssuerDomain).replace(/\/$/, '')}|${user.providerSubject}`;
}

function stripUndefined(value) {
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) out[key] = child;
  }
  return out;
}

export async function transformPostgresExport(options) {
  const inputDir = resolve(options.inputDir);
  const outputDir = resolve(options.outputDir);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const sourceRowsByTable = {};
  const outputRowsByTable = Object.fromEntries(
    TARGET_TABLES.map((table) => [table, []]),
  );
  const inputFiles = {};
  const idMap = { generatedAt: new Date().toISOString(), tables: {} };

  for (const mapping of TABLE_MAPPINGS) {
    const source = await readSourceTable(inputDir, mapping.sourceTable);
    inputFiles[mapping.sourceTable] = source.path;
    sourceRowsByTable[mapping.sourceTable] = source.rows;
    outputRowsByTable[mapping.targetTable] = source.rows.map((row) =>
      transformRow(mapping, row, options),
    );
    idMap.tables[mapping.targetTable] = mapIds(
      mapping,
      source.rows,
      outputRowsByTable[mapping.targetTable],
    );
  }

  const synthesized = synthesizeSearchRows(outputRowsByTable);
  if (synthesized.length > 0) {
    idMap.tables.entrySearch = Object.fromEntries(
      synthesized.map((row) => [row.entryId, row.id]),
    );
  }

  const validation = validateConvexRows(outputRowsByTable, {
    adminEmails: options.adminEmails ?? [],
    now: options.now,
  });
  const importDir = join(outputDir, 'convex-import');
  await writeConvexImportDirectory(importDir, outputRowsByTable);
  await writeFile(
    join(outputDir, 'id-map.json'),
    `${JSON.stringify(idMap, null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify(
      {
        generatedAt: idMap.generatedAt,
        inputDir,
        inputFiles,
        tables: Object.fromEntries(
          Object.entries(outputRowsByTable).map(([table, rows]) => [
            table,
            { documents: rows.length },
          ]),
        ),
        synthesized:
          synthesized.length > 0 ? { entrySearch: synthesized.length } : {},
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(outputDir, 'validation-report.json'),
    `${JSON.stringify(validation, null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, 'import-commands.sh'),
    importCommands(outputDir, outputRowsByTable),
  );

  let zipPath = null;
  if (options.zip) {
    zipPath = join(outputDir, 'convex-import.zip');
    await zipImportDirectory(importDir, zipPath);
  }

  return {
    outputDir,
    importDir,
    zipPath,
    idMap,
    rowsByTable: outputRowsByTable,
    validation,
  };
}

function mapIds(mapping, sourceRows, outputRows) {
  const out = {};
  for (let index = 0; index < sourceRows.length; index += 1) {
    const source = normalizeKeyedRow(sourceRows[index]);
    const target = outputRows[index];
    const sourceId =
      source.id ?? compositeSourceKey(mapping.sourceTable, source);
    if (sourceId !== undefined && target.id) out[String(sourceId)] = target.id;
  }
  return out;
}

function compositeSourceKey(sourceTable, source) {
  if (sourceTable === 'entry_tags')
    return `${source.entry_id}:${source.tag_id}`;
  if (sourceTable === 'user_roles')
    return `${source.user_id}:${source.role_id}`;
  if (sourceTable === 'entry_search') return source.entry_id;
  return undefined;
}

async function readSourceTable(inputDir, table) {
  const file = await findTableFile(inputDir, table);
  if (!file) return { path: null, rows: [] };
  const body = await readFile(file, 'utf8');
  if (file.endsWith('.jsonl') || file.endsWith('.ndjson'))
    return { path: file, rows: parseJsonLines(body, file) };
  if (file.endsWith('.json')) return { path: file, rows: JSON.parse(body) };
  if (file.endsWith('.csv')) return { path: file, rows: parseCsv(body) };
  throw new Error(`Unsupported export file extension: ${file}`);
}

async function findTableFile(inputDir, table) {
  const candidates = [
    `${table}.jsonl`,
    `${table}.ndjson`,
    `${table}.json`,
    `${table}.csv`,
    `${camelCase(table)}.jsonl`,
    `${camelCase(table)}.json`,
    `${camelCase(table)}.csv`,
  ];
  for (const candidate of candidates) {
    const file = join(inputDir, candidate);
    try {
      const info = await stat(file);
      if (info.isFile()) return file;
    } catch {
      // Try next candidate.
    }
  }
  const files = await readdir(inputDir).catch(() => []);
  return files.find(
    (file) => file.replace(/\.(jsonl|ndjson|json|csv)$/u, '') === table,
  )
    ? join(
        inputDir,
        files.find(
          (file) => file.replace(/\.(jsonl|ndjson|json|csv)$/u, '') === table,
        ),
      )
    : null;
}

function parseJsonLines(body, file) {
  return body
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: ${error.message}`);
      }
    });
}

export function parseCsv(body) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((values) => values.some((value) => value.length > 0))
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? '']),
      ),
    );
}

function synthesizeSearchRows(rowsByTable) {
  if (rowsByTable.entrySearch.length > 0) return [];
  const sensesByEntry = groupBy(rowsByTable.senses, 'entryId');
  const variantsByEntry = groupBy(rowsByTable.entryVariants, 'entryId');
  const now = Date.now();
  const synthesized = rowsByTable.entries
    .filter((entry) => entry.status === 'PUBLISHED' && !entry.deletedAt)
    .map((entry) => {
      const senses = (sensesByEntry.get(entry.id) ?? []).filter(
        (sense) => sense.status === 'PUBLISHED' && !sense.deletedAt,
      );
      const variants = variantsByEntry.get(entry.id) ?? [];
      return {
        id: entry.id,
        entryId: entry.id,
        entryType: entry.entryType,
        normalizedTitle: entry.normalizedTitle,
        primarySlug: entry.primarySlug,
        searchDocument: [
          entry.displayTitle,
          entry.normalizedTitle,
          entry.primarySlug,
          entry.summaryText,
          entry.summaryMd,
          ...senses.flatMap((sense) => [
            sense.senseLabel,
            sense.expandedForm,
            sense.definitionText,
            sense.definitionMd,
          ]),
          ...variants.map((variant) => variant.variantText),
        ]
          .filter(
            (value) => typeof value === 'string' && value.trim().length > 0,
          )
          .join(' '),
        updatedAt: now,
      };
    });
  rowsByTable.entrySearch = synthesized;
  return synthesized;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
}

async function writeConvexImportDirectory(importDir, rowsByTable) {
  await mkdir(importDir, { recursive: true });
  for (const table of TARGET_TABLES) {
    const tableDir = join(importDir, table);
    await mkdir(tableDir, { recursive: true });
    const lines = rowsByTable[table]
      .map((row) => JSON.stringify(row))
      .join('\n');
    await writeFile(
      join(tableDir, 'documents.jsonl'),
      lines.length > 0 ? `${lines}\n` : '',
    );
  }
}

function importCommands(outputDir, rowsByTable) {
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'DEPLOYMENT=${CONVEX_DEPLOYMENT:-dev}',
    `BASE_DIR=${JSON.stringify(resolve(outputDir))}`,
    '',
    '# Rehearsal/dev import, one table at a time. Use --replace only after reviewing validation-report.json.',
  ];
  for (const table of Object.keys(rowsByTable)) {
    lines.push(
      `npx convex import --deployment "$DEPLOYMENT" --table ${table} "$BASE_DIR/convex-import/${table}/documents.jsonl" --format jsonLines --append`,
    );
  }
  lines.push(
    '',
    '# Snapshot-style import after zipping convex-import/:',
    '#   (cd "$BASE_DIR/convex-import" && zip -qr "$BASE_DIR/convex-import.zip" .)',
    '#   npx convex import --deployment "$DEPLOYMENT" "$BASE_DIR/convex-import.zip" --replace',
    '',
  );
  return `${lines.join('\n')}\n`;
}

async function zipImportDirectory(importDir, zipPath) {
  await mkdir(dirname(zipPath), { recursive: true });
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('zip', ['-qr', zipPath, '.'], {
      cwd: importDir,
      stdio: 'inherit',
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`zip exited with ${code}`));
    });
  });
}

export async function readConvexImportDirectory(importDir) {
  const base = resolve(importDir);
  const actualBase = base.endsWith('convex-import')
    ? base
    : join(base, 'convex-import');
  const rowsByTable = {};
  for (const table of TARGET_TABLES) {
    const file = join(actualBase, table, 'documents.jsonl');
    try {
      rowsByTable[table] = parseJsonLines(await readFile(file, 'utf8'), file);
    } catch (error) {
      if (error.code === 'ENOENT') rowsByTable[table] = [];
      else throw error;
    }
  }
  return rowsByTable;
}

export function validateConvexRows(rowsByTable, options = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    counts: Object.fromEntries(
      TARGET_TABLES.map((table) => [table, rowsByTable[table]?.length ?? 0]),
    ),
    samples: {},
    errors: [],
    warnings: [],
  };

  for (const table of TARGET_TABLES) {
    const rows = rowsByTable[table] ?? [];
    report.samples[table] = rows.slice(0, 3);
    checkUniqueIds(report, table, rows);
  }

  const ids = Object.fromEntries(
    TARGET_TABLES.map((table) => [
      table,
      new Set((rowsByTable[table] ?? []).map((row) => row.id)),
    ]),
  );
  checkFk(report, rowsByTable.senses, 'senses.entryId', ids.entries);
  checkFk(
    report,
    rowsByTable.senseExamples,
    'senseExamples.senseId',
    ids.senses,
  );
  checkFk(
    report,
    rowsByTable.entryVariants,
    'entryVariants.entryId',
    ids.entries,
  );
  checkFk(
    report,
    rowsByTable.entrySlugHistory,
    'entrySlugHistory.entryId',
    ids.entries,
  );
  checkFk(report, rowsByTable.entryTags, 'entryTags.entryId', ids.entries);
  checkFk(report, rowsByTable.entryTags, 'entryTags.tagId', ids.tags);
  checkFk(
    report,
    rowsByTable.entryRelationships,
    'entryRelationships.fromEntryId',
    ids.entries,
  );
  checkFk(
    report,
    rowsByTable.entryRelationships,
    'entryRelationships.toEntryId',
    ids.entries,
  );
  checkFk(report, rowsByTable.sources, 'sources.id', ids.sources, {
    self: true,
  });
  checkFk(
    report,
    rowsByTable.sourceDocuments,
    'sourceDocuments.sourceId',
    ids.sources,
  );
  checkFk(report, rowsByTable.citations, 'citations.sourceId', ids.sources);
  checkFk(
    report,
    rowsByTable.citations,
    'citations.sourceDocumentId',
    ids.sourceDocuments,
  );
  checkFk(
    report,
    rowsByTable.fieldProvenance,
    'fieldProvenance.citationId',
    ids.citations,
  );
  checkFk(report, rowsByTable.ingestRuns, 'ingestRuns.sourceId', ids.sources);
  checkFk(
    report,
    rowsByTable.ingestItems,
    'ingestItems.ingestRunId',
    ids.ingestRuns,
  );
  checkFk(
    report,
    rowsByTable.ingestItems,
    'ingestItems.sourceDocumentId',
    ids.sourceDocuments,
  );
  checkFk(report, rowsByTable.userRoles, 'userRoles.userId', ids.users);
  checkFk(report, rowsByTable.userRoles, 'userRoles.roleId', ids.roles);
  checkFk(
    report,
    rowsByTable.auditEvents,
    'auditEvents.actorUserId',
    ids.users,
  );
  checkFk(
    report,
    rowsByTable.takedownCases,
    'takedownCases.createdByUserId',
    ids.users,
  );

  validateSearch(report, rowsByTable);
  validateAdminOwnership(
    report,
    rowsByTable,
    options.adminEmails ?? parseCsvList(process.env.SYNAC_ADMIN_EMAILS),
  );
  validateRateLimits(report, rowsByTable, options.now ?? Date.now());

  return report;
}

function checkUniqueIds(report, table, rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row.id) report.errors.push(`${table}: missing id`);
    if (seen.has(row.id))
      report.errors.push(`${table}: duplicate id ${row.id}`);
    seen.add(row.id);
  }
}

function checkFk(report, rows = [], fieldPath, targetIds, options = {}) {
  if (options.self) return;
  const [table, field] = fieldPath.split('.');
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined && !targetIds.has(value)) {
      report.errors.push(`${table}: ${field} ${value} does not exist`);
    }
  }
}

function validateSearch(report, rowsByTable) {
  const searchByEntry = new Map(
    (rowsByTable.entrySearch ?? []).map((row) => [row.entryId, row]),
  );
  const publishedEntries = (rowsByTable.entries ?? []).filter(
    (entry) => entry.status === 'PUBLISHED' && !entry.deletedAt,
  );
  for (const entry of publishedEntries) {
    const search = searchByEntry.get(entry.id);
    if (!search) {
      report.errors.push(`entrySearch: missing published entry ${entry.id}`);
      continue;
    }
    const haystack = String(search.searchDocument ?? '').toLowerCase();
    const title = String(
      entry.displayTitle ?? entry.normalizedTitle ?? '',
    ).toLowerCase();
    if (title && !haystack.includes(title)) {
      report.warnings.push(
        `entrySearch: ${entry.id} searchDocument does not contain displayTitle`,
      );
    }
  }
}

function validateAdminOwnership(report, rowsByTable, adminEmails) {
  const rolesById = new Map(
    (rowsByTable.roles ?? []).map((role) => [role.id, role.name]),
  );
  const usersById = new Map(
    (rowsByTable.users ?? []).map((user) => [user.id, user]),
  );
  const usersByEmail = new Map(
    (rowsByTable.users ?? []).map((user) => [
      String(user.email).toLowerCase(),
      user,
    ]),
  );
  const roleNamesByUserId = new Map();
  for (const link of rowsByTable.userRoles ?? []) {
    const names = roleNamesByUserId.get(link.userId) ?? [];
    names.push(rolesById.get(link.roleId));
    roleNamesByUserId.set(link.userId, names);
  }
  const adminUsers = [...roleNamesByUserId.entries()].filter(([, names]) =>
    names.includes('ADMIN'),
  );
  if (adminUsers.length === 0)
    report.warnings.push('admin: no users have ADMIN role in import');
  for (const email of adminEmails) {
    const user = usersByEmail.get(email.toLowerCase());
    if (!user) {
      report.warnings.push(
        `admin: allowlisted email ${email} is not present in users export`,
      );
      continue;
    }
    const roles = roleNamesByUserId.get(user.id) ?? [];
    if (!roles.includes('ADMIN'))
      report.errors.push(`admin: ${email} exists but lacks ADMIN role`);
  }
  for (const user of usersById.values()) {
    if (
      user.authProvider === 'OIDC' &&
      user.providerSubject &&
      !user.tokenIdentifier
    ) {
      report.warnings.push(
        `clerk: user ${user.email} has providerSubject but no tokenIdentifier`,
      );
    }
  }
}

function validateRateLimits(report, rowsByTable, now) {
  const staleCutoff = now - 24 * 60 * 60 * 1000;
  const stale = (rowsByTable.rateLimitBuckets ?? []).filter(
    (row) => row.windowStart < staleCutoff,
  );
  if (stale.length > 0) {
    report.warnings.push(
      `rateLimitBuckets: ${stale.length} rows are older than 24h and are usually not worth importing`,
    );
  }
}

export function parseCsvList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function sourceTables() {
  return [...SOURCE_TABLES];
}
