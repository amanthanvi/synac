import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  parseCsv,
  transformPostgresExport,
  validateConvexRows,
} from './lib/postgres-to-convex.mjs';

test('parseCsv handles quoted commas and newlines', () => {
  const rows = parseCsv('id,name,notes\n1,"NIST, Glossary","line 1\nline 2"\n');
  assert.deepEqual(rows, [
    { id: '1', name: 'NIST, Glossary', notes: 'line 1\nline 2' },
  ]);
});

test('transformPostgresExport preserves IDs, maps composites, derives Clerk tokens, and synthesizes search', async () => {
  const inputDir = await mkdtemp(join(tmpdir(), 'synac-pg-export-'));
  const outputDir = await mkdtemp(join(tmpdir(), 'synac-convex-import-'));
  const now = '2026-01-02T03:04:05.000Z';

  await writeJsonl(inputDir, 'roles', [{ id: 'role-admin', name: 'ADMIN' }]);
  await writeJsonl(inputDir, 'users', [
    {
      id: 'user-1',
      email: 'Admin@SynAc.App',
      display_name: 'Admin',
      auth_provider: 'OIDC',
      provider_subject: 'user_clerk_1',
      status: 'ACTIVE',
      created_at: now,
      last_login_at: now,
    },
  ]);
  await writeJsonl(inputDir, 'user_roles', [
    { user_id: 'user-1', role_id: 'role-admin' },
  ]);
  await writeJsonl(inputDir, 'entries', [
    {
      id: 'entry-1',
      entry_type: 'ACRONYM',
      display_title: 'APT',
      normalized_title: 'apt',
      primary_slug: 'apt',
      status: 'PUBLISHED',
      summary_md: 'Advanced persistent threat.',
      summary_text: 'Advanced persistent threat.',
      created_at: now,
      updated_at: now,
      published_at: now,
      created_by_user_id: 'user-1',
      updated_by_user_id: 'user-1',
    },
  ]);
  await writeJsonl(inputDir, 'senses', [
    {
      id: 'sense-1',
      entry_id: 'entry-1',
      sense_order: 1,
      definition_text: 'A stealthy threat actor.',
      expanded_form: 'Advanced Persistent Threat',
      is_preferred: true,
      status: 'PUBLISHED',
      created_at: now,
      updated_at: now,
      published_at: now,
    },
  ]);
  await writeJsonl(inputDir, 'entry_variants', [
    {
      id: 'variant-1',
      entry_id: 'entry-1',
      variant_text: 'advanced persistent threat',
      normalized_variant: 'advanced persistent threat',
      variant_type: 'ALIAS',
      created_at: now,
    },
  ]);
  await writeJsonl(inputDir, 'tags', [
    {
      id: 'tag-1',
      name: 'Threat Intel',
      slug: 'threat-intel',
      created_at: now,
      updated_at: now,
    },
  ]);
  await writeJsonl(inputDir, 'entry_tags', [
    { entry_id: 'entry-1', tag_id: 'tag-1' },
  ]);

  const result = await transformPostgresExport({
    inputDir,
    outputDir,
    clerkIssuerDomain: 'https://clerk.synac.app',
    adminEmails: ['admin@synac.app'],
  });

  const user = result.rowsByTable.users[0];
  assert.equal(user.email, 'admin@synac.app');
  assert.equal(user.tokenIdentifier, 'https://clerk.synac.app|user_clerk_1');
  assert.equal(result.rowsByTable.entries[0].createdAt, Date.parse(now));
  assert.equal(result.rowsByTable.entryTags[0].entryId, 'entry-1');
  assert.match(result.rowsByTable.entryTags[0].id, /^entryTags:/u);
  assert.equal(result.rowsByTable.entrySearch.length, 1);
  assert.match(
    result.rowsByTable.entrySearch[0].searchDocument,
    /Advanced Persistent Threat/u,
  );
  assert.equal(result.validation.errors.length, 0);

  const idMap = JSON.parse(
    await readFile(join(outputDir, 'id-map.json'), 'utf8'),
  );
  assert.equal(idMap.tables.entries['entry-1'], 'entry-1');
  assert.equal(idMap.tables.entry_tags, undefined);
  assert.equal(
    idMap.tables.entryTags['entry-1:tag-1'],
    result.rowsByTable.entryTags[0].id,
  );
});

test('validateConvexRows reports missing relationships and absent admin role', () => {
  const report = validateConvexRows(
    {
      roles: [{ id: 'role-viewer', name: 'VIEWER' }],
      users: [
        {
          id: 'user-1',
          email: 'admin@synac.app',
          authProvider: 'OIDC',
          providerSubject: 'user_1',
        },
      ],
      userRoles: [{ id: 'link-1', userId: 'user-1', roleId: 'role-viewer' }],
      entries: [
        {
          id: 'entry-1',
          status: 'PUBLISHED',
          displayTitle: 'APT',
          normalizedTitle: 'apt',
        },
      ],
      senses: [{ id: 'sense-1', entryId: 'missing-entry' }],
      entrySearch: [],
    },
    { adminEmails: ['admin@synac.app'] },
  );

  assert.match(
    report.errors.join('\n'),
    /senses: entryId missing-entry does not exist/u,
  );
  assert.match(
    report.errors.join('\n'),
    /admin@synac.app exists but lacks ADMIN role/u,
  );
  assert.match(
    report.errors.join('\n'),
    /entrySearch: missing published entry entry-1/u,
  );
});

async function writeJsonl(dir, table, rows) {
  await writeFile(
    join(dir, `${table}.jsonl`),
    `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
}
