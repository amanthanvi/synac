import type { MutationCtx, QueryCtx } from '../_generated/server';

type DatabaseCtx = Pick<QueryCtx | MutationCtx, 'db'>;

export type ActiveGeneration = {
  version: string;
  formatVersion: number;
};

export async function activeGeneration(
  ctx: DatabaseCtx,
): Promise<ActiveGeneration | null> {
  const meta = await ctx.db
    .query('syncMeta')
    .withIndex('by_key', (q) => q.eq('key', 'content'))
    .unique();
  if (!meta?.contentVersion) return null;
  return {
    version: meta.contentVersion,
    formatVersion: meta.formatVersion ?? 1,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
  }
  return result;
}

export async function stablePayloadHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
