import { getPrismaClient } from '@synac/db';

import { slugify } from '@/lib/text';

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type LicenseType =
  | 'PUBLIC_DOMAIN'
  | 'CC_BY_4_0'
  | 'CC_BY_SA_4_0'
  | 'CC0_1_0'
  | 'PROPRIETARY'
  | 'OTHER';

type SourceTrustTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';
type SourceAccessMethod = 'API' | 'RSS' | 'HTML' | 'PDF' | 'OTHER';
type SourceRobotsPolicy = 'RESPECT' | 'EXPLICIT_PERMISSION';

function parseLicenseType(value: string): LicenseType {
  const v = value.toUpperCase();
  if (
    v === 'PUBLIC_DOMAIN' ||
    v === 'CC_BY_4_0' ||
    v === 'CC_BY_SA_4_0' ||
    v === 'CC0_1_0' ||
    v === 'PROPRIETARY' ||
    v === 'OTHER'
  ) {
    return v;
  }
  return 'OTHER';
}

function parseTrustTier(value: string): SourceTrustTier {
  const v = value.toUpperCase();
  if (v === 'TIER_1' || v === 'TIER_2' || v === 'TIER_3' || v === 'TIER_4') return v;
  return 'TIER_4';
}

function parseAccessMethod(value: string): SourceAccessMethod {
  const v = value.toUpperCase();
  if (v === 'API' || v === 'RSS' || v === 'HTML' || v === 'PDF' || v === 'OTHER') return v;
  return 'OTHER';
}

function parseRobotsPolicy(value: string): SourceRobotsPolicy {
  const v = value.toUpperCase();
  if (v === 'RESPECT' || v === 'EXPLICIT_PERMISSION') return v;
  return 'RESPECT';
}

function parseDateInput(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Invalid date format (expected YYYY-MM-DD)');
  return new Date(`${v}T00:00:00.000Z`);
}

type JsonInputValue = string | number | boolean | JsonInputValue[] | { [key: string]: JsonInputValue };

function isJsonInputValue(value: unknown): value is JsonInputValue {
  if (value === null) return false;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonInputValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every(isJsonInputValue);
  return false;
}

function parseJsonInput(value: string): JsonInputValue {
  const v = value.trim();
  if (!v) throw new Error('JSON input required');
  const parsed = JSON.parse(v) as unknown;
  if (!isJsonInputValue(parsed)) {
    throw new Error('JSON must not contain null values');
  }
  return parsed;
}

function requireNonEmpty(label: string, value: string): string {
  const v = normalizeWhitespace(value);
  if (!v) throw new Error(`${label} is required`);
  return v;
}

function requireHttpsUrl(label: string, value: string): string {
  const v = normalizeWhitespace(value);
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https`);
  return parsed.toString();
}

export async function createSource(input: {
  actorUserId: string;
  name: string;
  sourceSlug: string;
  baseUrl: string;
  cronSchedule?: string | null;
  licenseType: string;
  licenseNotes?: string | null;
  allowedUse: string;
  attributionRequirements: string;
  accessMethod: string;
  robotsPolicy: string;
  rateLimitPolicy?: string | null;
  contact?: string | null;
  lastVerifiedAt?: string | null;
  trustTier: string;
  enabled: boolean;
  notesInternal?: string | null;
}): Promise<{ sourceId: string }> {
  const prisma = getPrismaClient();

  const sourceSlug = slugify(requireNonEmpty('Source slug', input.sourceSlug));
  const baseUrl = requireHttpsUrl('Base URL', input.baseUrl);

  const existing = await prisma.source.findFirst({ where: { sourceSlug }, select: { id: true } });
  if (existing) throw new Error(`Source slug already exists: ${sourceSlug}`);

  const lastVerifiedAt = input.lastVerifiedAt ? parseDateInput(input.lastVerifiedAt) : null;
  if (input.enabled && !lastVerifiedAt) {
    throw new Error('Cannot enable a source until it has been manually verified (set lastVerifiedAt)');
  }

  const created = await prisma.source.create({
    data: {
      name: requireNonEmpty('Name', input.name),
      sourceSlug,
      baseUrl,
      cronSchedule: input.cronSchedule?.trim() ? normalizeWhitespace(input.cronSchedule) : null,
      licenseType: parseLicenseType(input.licenseType),
      licenseNotes: input.licenseNotes?.trim() ? normalizeWhitespace(input.licenseNotes) : null,
      allowedUse: requireNonEmpty('Allowed use', input.allowedUse),
      attributionRequirements: requireNonEmpty(
        'Attribution requirements',
        input.attributionRequirements,
      ),
      accessMethod: parseAccessMethod(input.accessMethod),
      robotsPolicy: parseRobotsPolicy(input.robotsPolicy),
      rateLimitPolicy: input.rateLimitPolicy?.trim() ? parseJsonInput(input.rateLimitPolicy) : undefined,
      contact: input.contact?.trim() ? normalizeWhitespace(input.contact) : null,
      lastVerifiedAt,
      trustTier: parseTrustTier(input.trustTier),
      enabled: Boolean(input.enabled),
      notesInternal: input.notesInternal?.trim() ? normalizeWhitespace(input.notesInternal) : null,
    },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      baseUrl: true,
      cronSchedule: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      accessMethod: true,
      robotsPolicy: true,
      rateLimitPolicy: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      notesInternal: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'SOURCE_CREATE',
      entityType: 'SOURCE',
      entityId: created.id,
      after: toJsonSafe(created),
    },
  });

  return { sourceId: created.id };
}

export async function updateSource(input: {
  actorUserId: string;
  sourceId: string;
  name: string;
  sourceSlug: string;
  baseUrl: string;
  cronSchedule?: string | null;
  licenseType: string;
  licenseNotes?: string | null;
  allowedUse: string;
  attributionRequirements: string;
  accessMethod: string;
  robotsPolicy: string;
  rateLimitPolicy?: string | null;
  contact?: string | null;
  lastVerifiedAt?: string | null;
  trustTier: string;
  notesInternal?: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();

  const before = await prisma.source.findFirst({
    where: { id: input.sourceId },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      baseUrl: true,
      cronSchedule: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      accessMethod: true,
      robotsPolicy: true,
      rateLimitPolicy: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      notesInternal: true,
    },
  });
  if (!before) throw new Error('Source not found');

  const sourceSlug = slugify(requireNonEmpty('Source slug', input.sourceSlug));
  const baseUrl = requireHttpsUrl('Base URL', input.baseUrl);

  if (sourceSlug !== before.sourceSlug) {
    const existing = await prisma.source.findFirst({
      where: { sourceSlug, NOT: { id: before.id } },
      select: { id: true },
    });
    if (existing) throw new Error(`Source slug already exists: ${sourceSlug}`);
  }

  const lastVerifiedAt = input.lastVerifiedAt ? parseDateInput(input.lastVerifiedAt) : null;
  if (before.enabled && !lastVerifiedAt) {
    throw new Error('Enabled sources must have been manually verified (set lastVerifiedAt)');
  }

  const after = await prisma.source.update({
    where: { id: before.id },
    data: {
      name: requireNonEmpty('Name', input.name),
      sourceSlug,
      baseUrl,
      cronSchedule: input.cronSchedule?.trim() ? normalizeWhitespace(input.cronSchedule) : null,
      licenseType: parseLicenseType(input.licenseType),
      licenseNotes: input.licenseNotes?.trim() ? normalizeWhitespace(input.licenseNotes) : null,
      allowedUse: requireNonEmpty('Allowed use', input.allowedUse),
      attributionRequirements: requireNonEmpty(
        'Attribution requirements',
        input.attributionRequirements,
      ),
      accessMethod: parseAccessMethod(input.accessMethod),
      robotsPolicy: parseRobotsPolicy(input.robotsPolicy),
      rateLimitPolicy: input.rateLimitPolicy?.trim() ? parseJsonInput(input.rateLimitPolicy) : undefined,
      contact: input.contact?.trim() ? normalizeWhitespace(input.contact) : null,
      lastVerifiedAt,
      trustTier: parseTrustTier(input.trustTier),
      notesInternal: input.notesInternal?.trim() ? normalizeWhitespace(input.notesInternal) : null,
    },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      baseUrl: true,
      cronSchedule: true,
      licenseType: true,
      licenseNotes: true,
      allowedUse: true,
      attributionRequirements: true,
      accessMethod: true,
      robotsPolicy: true,
      rateLimitPolicy: true,
      contact: true,
      lastVerifiedAt: true,
      trustTier: true,
      enabled: true,
      notesInternal: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'SOURCE_UPDATE',
      entityType: 'SOURCE',
      entityId: before.id,
      before: toJsonSafe(before),
      after: toJsonSafe(after),
    },
  });
}

export async function setSourceEnabled(input: {
  actorUserId: string;
  sourceId: string;
  enabled: boolean;
}): Promise<void> {
  const prisma = getPrismaClient();

  const before = await prisma.source.findFirst({
    where: { id: input.sourceId },
    select: {
      id: true,
      enabled: true,
      lastVerifiedAt: true,
    },
  });
  if (!before) throw new Error('Source not found');

  if (input.enabled && !before.lastVerifiedAt) {
    throw new Error('Cannot enable a source until it has been manually verified (set lastVerifiedAt)');
  }

  const after = await prisma.source.update({
    where: { id: before.id },
    data: { enabled: Boolean(input.enabled) },
    select: {
      id: true,
      enabled: true,
      lastVerifiedAt: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.enabled ? 'SOURCE_ENABLE' : 'SOURCE_DISABLE',
      entityType: 'SOURCE',
      entityId: before.id,
      before: toJsonSafe(before),
      after: toJsonSafe(after),
    },
  });
}
