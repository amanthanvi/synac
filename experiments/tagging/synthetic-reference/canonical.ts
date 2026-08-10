import { createHash } from 'node:crypto';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('canonical JSON cannot contain a non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined)
        throw new Error(`canonical JSON cannot contain undefined at ${key}`);
      result[key] = normalizeJson(child);
    }
    return result;
  }
  throw new Error(`canonical JSON cannot contain ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

export function seededOrder(seed: string, value: string): string {
  return sha256(`${seed}\0${value}`);
}

export function normalizeWhitespace(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function normalizeConcept(value: string): string {
  return normalizeWhitespace(value)
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}
