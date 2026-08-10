import { createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson } from './canonical.ts';
import type { SealedRole } from './types.ts';

const KEY_ENV: Readonly<Record<SealedRole, string>> = Object.freeze({
  primary: 'SYNAC_SEALED_KEY_PRIMARY',
  critic: 'SYNAC_SEALED_KEY_CRITIC',
  arbiter: 'SYNAC_SEALED_KEY_ARBITER',
  auditor: 'SYNAC_SEALED_KEY_AUDITOR',
});

export type SealedStoreConfig = Readonly<{
  directory: string;
  repositoryRoot: string;
  keyEnvironment: Readonly<Record<SealedRole, string>>;
}>;

export type SealedStoreRoleSession = Readonly<{
  role: SealedRole;
  has: (sealId: string) => boolean;
  append: <T>(
    sealId: string,
    payload: T,
    validate: (value: unknown) => T,
  ) => Promise<void>;
  read: <T>(sealId: string, validate: (value: unknown) => T) => Promise<T>;
}>;

type Envelope = Readonly<{
  schemaVersion: 'synac-sealed-record-v1';
  role: SealedRole;
  sealId: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}>;

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

export function sealedStoreConfig(
  environment: NodeJS.ProcessEnv = process.env,
  repositoryRoot = process.cwd(),
): SealedStoreConfig {
  const configured = environment.SYNAC_SEALED_STORE_DIR;
  if (!configured) throw new Error('SYNAC_SEALED_STORE_DIR is required');
  if (!path.isAbsolute(configured))
    throw new Error('SYNAC_SEALED_STORE_DIR must be an absolute path');
  const directory = path.resolve(configured);
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  if (isWithin(directory, resolvedRepositoryRoot)) {
    throw new Error('SYNAC_SEALED_STORE_DIR must be outside the repository');
  }
  return {
    directory,
    repositoryRoot: resolvedRepositoryRoot,
    keyEnvironment: KEY_ENV,
  };
}

function roleKey(
  config: SealedStoreConfig,
  role: SealedRole,
  environment: NodeJS.ProcessEnv,
): Buffer {
  const variable = config.keyEnvironment[role];
  const encoded = environment[variable];
  if (!encoded) throw new Error(`${variable} is required for role ${role}`);
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error(`${variable} must be one base64-encoded 256-bit key`);
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    key.fill(0);
    throw new Error(
      `${variable} must be one canonical base64-encoded 256-bit key`,
    );
  }
  return key;
}

function storePath(config: SealedStoreConfig, role: SealedRole): string {
  return path.join(config.directory, `${role}.sealed.ndjson`);
}

function assertExternalConfig(config: SealedStoreConfig): void {
  if (
    !path.isAbsolute(config.directory) ||
    !path.isAbsolute(config.repositoryRoot)
  ) {
    throw new Error(
      'sealed-store directory and repository root must be absolute paths',
    );
  }
  if (
    isWithin(
      path.resolve(config.directory),
      path.resolve(config.repositoryRoot),
    )
  ) {
    throw new Error('sealed-store directory must be outside the repository');
  }
}

function aad(role: SealedRole, sealId: string): Buffer {
  return Buffer.from(
    canonicalJson({ schemaVersion: 'synac-sealed-record-v1', role, sealId }),
    'utf8',
  );
}

function validateEnvelope(
  value: unknown,
  expectedRole: SealedRole,
  line: number,
): Envelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`sealed line ${line}: envelope must be an object`);
  const envelope = value as Record<string, unknown>;
  const expectedKeys = [
    'authTag',
    'ciphertext',
    'iv',
    'role',
    'schemaVersion',
    'sealId',
  ];
  if (Object.keys(envelope).sort().join('\0') !== expectedKeys.join('\0'))
    throw new Error(`sealed line ${line}: invalid envelope keys`);
  if (envelope.schemaVersion !== 'synac-sealed-record-v1')
    throw new Error(`sealed line ${line}: invalid schemaVersion`);
  if (envelope.role !== expectedRole)
    throw new Error(
      `sealed line ${line}: foreign role ${String(envelope.role)}`,
    );
  if (typeof envelope.sealId !== 'string' || envelope.sealId.length < 16)
    throw new Error(`sealed line ${line}: invalid sealId`);
  for (const property of ['iv', 'ciphertext', 'authTag'] as const) {
    if (
      typeof envelope[property] !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope[property])
    )
      throw new Error(`sealed line ${line}: invalid ${property}`);
  }
  if (Buffer.from(envelope.iv as string, 'base64').length !== 12)
    throw new Error(`sealed line ${line}: IV must be 96 bits`);
  if (Buffer.from(envelope.authTag as string, 'base64').length !== 16)
    throw new Error(`sealed line ${line}: auth tag must be 128 bits`);
  return value as Envelope;
}

async function readEnvelopes(
  config: SealedStoreConfig,
  role: SealedRole,
): Promise<readonly Envelope[]> {
  let raw: string;
  try {
    raw = await readFile(storePath(config, role), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`sealed line ${index + 1}: invalid JSON`);
      }
      return validateEnvelope(value, role, index + 1);
    });
}

function indexEnvelopes(envelopes: readonly Envelope[]): Map<string, Envelope> {
  const indexed = new Map<string, Envelope>();
  for (const envelope of envelopes) {
    if (indexed.has(envelope.sealId)) {
      throw new Error(
        `seal replay detected while indexing: ${envelope.sealId}`,
      );
    }
    indexed.set(envelope.sealId, envelope);
  }
  return indexed;
}

async function encryptEnvelope<T>(
  config: SealedStoreConfig,
  role: SealedRole,
  sealId: string,
  payload: T,
  environment: NodeJS.ProcessEnv,
): Promise<Envelope> {
  const key = roleKey(config, role, environment);
  const iv = await import('node:crypto').then(({ randomBytes }) =>
    randomBytes(12),
  );
  const plaintext = Buffer.from(canonicalJson(payload), 'utf8');
  let ciphertext: Buffer | undefined;
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(role, sealId));
    ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      schemaVersion: 'synac-sealed-record-v1',
      role,
      sealId,
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  } finally {
    key.fill(0);
    iv.fill(0);
    plaintext.fill(0);
    ciphertext?.fill(0);
  }
}

async function appendEnvelope(
  config: SealedStoreConfig,
  role: SealedRole,
  envelope: Envelope,
): Promise<void> {
  await mkdir(config.directory, { recursive: true, mode: 0o700 });
  const handle = await open(storePath(config, role), 'a', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function decryptEnvelope<T>(
  config: SealedStoreConfig,
  role: SealedRole,
  sealId: string,
  envelope: Envelope,
  validate: (value: unknown) => T,
  environment: NodeJS.ProcessEnv,
): Promise<T> {
  const key = roleKey(config, role, environment);
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(role, sealId));
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext.toString('utf8'));
    } catch {
      throw new Error(
        `sealed record ${sealId}: decrypted payload is invalid JSON`,
      );
    }
    return validate(parsed);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('sealed record'))
      throw error;
    throw new Error(`sealed record ${sealId}: authentication failed`, {
      cause: error,
    });
  } finally {
    key.fill(0);
    iv.fill(0);
    authTag.fill(0);
    ciphertext.fill(0);
    plaintext?.fill(0);
  }
}

/**
 * Opens one single-writer role session and indexes its append-only envelope
 * file exactly once. Callers processing many records must reuse this session.
 */
export async function openSealedStoreRole(
  config: SealedStoreConfig,
  role: SealedRole,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SealedStoreRoleSession> {
  assertExternalConfig(config);
  const key = roleKey(config, role, environment);
  key.fill(0);
  const indexed = indexEnvelopes(await readEnvelopes(config, role));
  return {
    role,
    has: (sealId) => indexed.has(sealId),
    append: async <T>(
      sealId: string,
      payload: T,
      validate: (value: unknown) => T,
    ): Promise<void> => {
      if (sealId.length < 16)
        throw new Error('sealId must contain at least 16 characters');
      validate(payload);
      if (indexed.has(sealId)) throw new Error(`seal replay: ${sealId}`);
      const envelope = await encryptEnvelope(
        config,
        role,
        sealId,
        payload,
        environment,
      );
      await appendEnvelope(config, role, envelope);
      indexed.set(sealId, envelope);
    },
    read: async <T>(
      sealId: string,
      validate: (value: unknown) => T,
    ): Promise<T> => {
      const envelope = indexed.get(sealId);
      if (!envelope)
        throw new Error(`foreign seal or missing record: ${sealId}`);
      return decryptEnvelope(
        config,
        role,
        sealId,
        envelope,
        validate,
        environment,
      );
    },
  };
}

export async function appendSealedRecord<T>(
  config: SealedStoreConfig,
  role: SealedRole,
  sealId: string,
  payload: T,
  validate: (value: unknown) => T,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const session = await openSealedStoreRole(config, role, environment);
  await session.append(sealId, payload, validate);
}

export async function readSealedRecord<T>(
  config: SealedStoreConfig,
  role: SealedRole,
  sealId: string,
  validate: (value: unknown) => T,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const session = await openSealedStoreRole(config, role, environment);
  return session.read(sealId, validate);
}
