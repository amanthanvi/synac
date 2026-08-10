import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendSealedRecord,
  readSealedRecord,
  sealedStoreConfig,
} from './sealed-store.ts';

const primaryKey = Buffer.alloc(32, 11).toString('base64');
const environment = {
  SYNAC_SEALED_KEY_PRIMARY: primaryKey,
  SYNAC_SEALED_KEY_CRITIC: Buffer.alloc(32, 12).toString('base64'),
  SYNAC_SEALED_KEY_ARBITER: Buffer.alloc(32, 13).toString('base64'),
  SYNAC_SEALED_KEY_AUDITOR: Buffer.alloc(32, 14).toString('base64'),
};

function payloadValidator(value: unknown): { kind: 'result'; secret: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid payload');
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).sort().join(',') !== 'kind,secret' ||
    item.kind !== 'result' ||
    typeof item.secret !== 'string'
  )
    throw new Error('invalid payload');
  return value as { kind: 'result'; secret: string };
}

test('sealed store rejects replay/foreign seals and leaks no key or plaintext', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'synac-seal-test-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  const store = path.join(root, 'sealed');
  await mkdir(repository);
  const env = { ...environment, SYNAC_SEALED_STORE_DIR: store };
  const config = sealedStoreConfig(env, repository);
  const sealId = 'seal-000000000001';
  const payload = {
    kind: 'result' as const,
    secret: 'plaintext-canary-swordfish',
  };

  await appendSealedRecord(
    config,
    'primary',
    sealId,
    payload,
    payloadValidator,
    env,
  );
  assert.deepEqual(
    await readSealedRecord(config, 'primary', sealId, payloadValidator, env),
    payload,
  );
  await assert.rejects(
    appendSealedRecord(
      config,
      'primary',
      sealId,
      payload,
      payloadValidator,
      env,
    ),
    /seal replay/,
  );
  await assert.rejects(
    readSealedRecord(
      config,
      'primary',
      'foreign-seal-00001',
      payloadValidator,
      env,
    ),
    /foreign seal/,
  );

  const raw = await readFile(path.join(store, 'primary.sealed.ndjson'), 'utf8');
  assert.equal(
    raw.includes(payload.secret),
    false,
    'plaintext leaked into sealed file',
  );
  assert.equal(raw.includes(primaryKey), false, 'key leaked into sealed file');
});

test('invalid payload is rejected before a sealed file is created', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'synac-seal-invalid-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  const store = path.join(root, 'sealed');
  await mkdir(repository);
  const env = { ...environment, SYNAC_SEALED_STORE_DIR: store };
  const config = sealedStoreConfig(env, repository);
  await assert.rejects(
    appendSealedRecord<unknown>(
      config,
      'primary',
      'seal-000000000002',
      { secret: 'missing kind' },
      payloadValidator,
      env,
    ),
    /invalid payload/,
  );
  await assert.rejects(
    readFile(path.join(store, 'primary.sealed.ndjson')),
    /ENOENT/,
  );
});

test('per-role key mismatch fails authentication', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'synac-seal-auth-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  const store = path.join(root, 'sealed');
  await mkdir(repository);
  const env = { ...environment, SYNAC_SEALED_STORE_DIR: store };
  const config = sealedStoreConfig(env, repository);
  await appendSealedRecord(
    config,
    'primary',
    'seal-000000000003',
    { kind: 'result', secret: 'protected' },
    payloadValidator,
    env,
  );
  const wrong = {
    ...env,
    SYNAC_SEALED_KEY_PRIMARY: Buffer.alloc(32, 99).toString('base64'),
  };
  await assert.rejects(
    readSealedRecord(
      config,
      'primary',
      'seal-000000000003',
      payloadValidator,
      wrong,
    ),
    /authentication failed/,
  );
});

test('sealed-store configuration rejects repository-local paths', async () => {
  const repository = path.resolve('repository-root');
  assert.throws(
    () =>
      sealedStoreConfig(
        {
          ...environment,
          SYNAC_SEALED_STORE_DIR: path.join(repository, 'sealed'),
        },
        repository,
      ),
    /outside the repository/,
  );
  const external = sealedStoreConfig(
    {
      ...environment,
      SYNAC_SEALED_STORE_DIR: path.resolve('external-sealed-store'),
    },
    repository,
  );
  await assert.rejects(
    appendSealedRecord(
      { ...external, directory: path.join(repository, 'manually-bypassed') },
      'primary',
      'seal-000000000004',
      { kind: 'result', secret: 'must-not-write' },
      payloadValidator,
      environment,
    ),
    /outside the repository/,
  );
});
