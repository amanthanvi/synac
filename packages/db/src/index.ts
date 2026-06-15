export {
  ConvexDataClient,
  PrismaClient,
  createConvexIngestRun,
  createPrismaClient,
  getPrismaClient,
  getPrismaClientForUrl,
  hitConvexRateLimit,
  queryPublicConvex,
  rebuildConvexSearchIndex,
  searchConvexEntries,
  trackPublishedEntryView,
  withTransaction,
} from './client.js';
export type {
  DbClientLike,
  DbTransactionClient,
  EntryType,
  InputJsonObject,
  InputJsonValue,
  JsonObject,
  JsonValue,
  RoleName,
} from './client.js';

export type EntryListItem = {
  id: string;
  entryType: EntryType;
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type SearchResult = EntryListItem & {
  snippet: string | null;
  senseCount: number | null;
  senseSummary: string | null;
  bucket: number;
  score: number;
};

export type TagListItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  updatedAt: Date;
};

export type PublicSource = {
  id: string;
  name: string;
  sourceSlug: string;
  baseUrl: string;
  licenseType: string;
  licenseNotes: string | null;
  allowedUse: string;
  attributionRequirements: string;
  contact: string | null;
  lastVerifiedAt: Date | null;
  trustTier: string;
  enabled: boolean;
  updatedAt: Date;
};

export type UserWithRoles = {
  id: string;
  email: string;
  displayName: string | null;
  authProvider: 'OIDC' | 'LOCAL';
  providerSubject: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  lastLoginAt: Date | null;
  roles: Array<{ role: { id: string; name: RoleName } }>;
};

export type AllowlistedRole = Exclude<RoleName, 'VIEWER'>;

import type { DbClientLike, EntryType, RoleName } from './client.js';
import {
  createConvexIngestRun,
  queryPublicConvex,
  rebuildConvexSearchIndex,
  searchConvexEntries,
} from './client.js';

function normalizeQueryPage(input: { page: number; pageSize: number }): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export async function resolvePublishedEntryBySlug(
  _db: DbClientLike,
  input: { entryType: EntryType; slug: string },
): Promise<{ entry: EntryListItem; canonicalSlug: string; needsRedirect: boolean } | null> {
  return queryPublicConvex('resolvePublishedEntryBySlug', input);
}

export async function listPublishedEntriesByLetter(
  _db: DbClientLike,
  input: { entryType: EntryType; letter: string; page: number; pageSize: number },
): Promise<EntryListItem[]> {
  const data = await queryPublicConvex<{ entries: EntryListItem[] }>('loadBrowsePageData', {
    entryType: input.entryType,
    letter: input.letter.trim().toLowerCase(),
    page: input.page,
    pageSize: input.pageSize,
    sort: 'title',
    query: '',
    rawTag: '',
  });
  return data.entries;
}

export async function listRecentPublishedEntries(
  _db: DbClientLike,
  input: { page: number; pageSize: number },
): Promise<EntryListItem[]> {
  return queryPublicConvex('listRecentPublishedEntries', input);
}

export async function searchPublishedEntries(
  _db: DbClientLike,
  input: { query: string; entryType?: EntryType; tagSlug?: string; page: number; pageSize: number },
): Promise<SearchResult[]> {
  return (await searchConvexEntries(input)) as SearchResult[];
}

export async function resolveTagBySlug(
  _db: DbClientLike,
  input: { slug: string },
): Promise<{ tag: TagListItem; canonicalSlug: string; needsRedirect: boolean } | null> {
  return queryPublicConvex('resolveTagBySlug', input);
}

export async function listTags(_db: DbClientLike): Promise<TagListItem[]> {
  const tags = await queryPublicConvex<Array<TagListItem & { count: number }>>('listTagsWithCounts');
  return tags.map(({ count: _count, ...tag }) => tag);
}

export async function listPublishedEntriesForTag(
  _db: DbClientLike,
  input: { tagId: string; entryType?: EntryType; page: number; pageSize: number },
): Promise<EntryListItem[]> {
  return queryPublicConvex('listPublishedEntriesForTag', {
    tagId: input.tagId,
    entryType: input.entryType ?? null,
    page: input.page,
    pageSize: input.pageSize,
  });
}

export async function listPublicSources(_db: DbClientLike): Promise<PublicSource[]> {
  return queryPublicConvex('listPublicSources');
}

export async function resolvePublicSourceBySlug(_db: DbClientLike, input: { slug: string }): Promise<PublicSource | null> {
  if (!input.slug.trim()) return null;
  return queryPublicConvex('resolvePublicSourceBySlug', input);
}

export async function listPublishedRelationshipsForEntry(
  db: DbClientLike,
  input: { entryId: string; limit: number },
): Promise<
  Array<{
    id: string;
    relationshipType: string;
    weight: number;
    otherEntry: EntryListItem;
  }>
> {
  const [from, to] = await Promise.all([
    db.entryRelationship.findMany<Record<string, unknown>>({
      where: { fromEntryId: input.entryId, deletedAt: null, toEntry: { status: 'PUBLISHED', deletedAt: null } },
      include: { toEntry: true },
      take: input.limit,
    }),
    db.entryRelationship.findMany<Record<string, unknown>>({
      where: { toEntryId: input.entryId, deletedAt: null, fromEntry: { status: 'PUBLISHED', deletedAt: null } },
      include: { fromEntry: true },
      take: input.limit,
    }),
  ]);
  return [...from, ...to]
    .map((row) => ({
      id: String(row.id),
      relationshipType: String(row.relationshipType),
      weight: typeof row.weight === 'number' ? row.weight : 0,
      otherEntry: (row.toEntry ?? row.fromEntry) as EntryListItem,
    }))
    .filter((row) => row.otherEntry)
    .slice(0, input.limit);
}

export async function getSearchIndexCoverage(
  db: DbClientLike,
  input?: { limit?: number },
): Promise<{
  publishedEntries: number;
  indexedEntries: number;
  missingEntryIds: string[];
  orphanedEntryIds: string[];
}> {
  void input;
  const [publishedEntries, indexedEntries] = await Promise.all([
    db.entry.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    db.entrySearch.count({}),
  ]);
  return { publishedEntries, indexedEntries, missingEntryIds: [], orphanedEntryIds: [] };
}

export async function rebuildSearchIndex(): Promise<unknown> {
  return rebuildConvexSearchIndex();
}

export async function listTrendingEntries(): Promise<unknown[]> {
  return [];
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function pickAllowlistedRole(
  email: string,
  allowlists: { adminEmails: readonly string[]; editorEmails: readonly string[] },
): AllowlistedRole | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (new Set(allowlists.adminEmails.map((e) => e.toLowerCase())).has(normalizedEmail)) return 'ADMIN';
  if (new Set(allowlists.editorEmails.map((e) => e.toLowerCase())).has(normalizedEmail)) return 'EDITOR';
  return null;
}

export function getRoleNames(user: UserWithRoles): RoleName[] {
  return user.roles.map((roleLink) => roleLink.role.name);
}

export async function ensureDefaultRoles(db: DbClientLike): Promise<Record<RoleName, string>> {
  const admin = await db.role.upsert<{ id: string }>({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
  const editor = await db.role.upsert<{ id: string }>({ where: { name: 'EDITOR' }, update: {}, create: { name: 'EDITOR' } });
  const viewer = await db.role.upsert<{ id: string }>({ where: { name: 'VIEWER' }, update: {}, create: { name: 'VIEWER' } });
  return { ADMIN: admin.id, EDITOR: editor.id, VIEWER: viewer.id };
}

export async function upsertUserFromOidc(
  db: DbClientLike,
  input: { email: string; displayName?: string | null; providerSubject?: string | null; lastLoginAt?: Date },
): Promise<UserWithRoles> {
  return db.user.upsert<UserWithRoles>({
    where: { email: input.email.trim().toLowerCase() },
    update: {
      status: 'ACTIVE',
      displayName: input.displayName ?? null,
      providerSubject: input.providerSubject ?? null,
      lastLoginAt: input.lastLoginAt ?? new Date(),
    },
    create: {
      email: input.email.trim().toLowerCase(),
      status: 'ACTIVE',
      authProvider: 'OIDC',
      displayName: input.displayName ?? null,
      providerSubject: input.providerSubject ?? null,
      lastLoginAt: input.lastLoginAt ?? new Date(),
    },
    include: { roles: { include: { role: true } } },
  });
}

export async function ensureUserRole(db: DbClientLike, input: { userId: string; roleId: string }): Promise<void> {
  await db.userRole.upsert({
    where: { userId_roleId: { userId: input.userId, roleId: input.roleId } },
    update: {},
    create: { userId: input.userId, roleId: input.roleId },
  });
}

export async function bootstrapUserFromAllowlist(
  db: DbClientLike,
  input: {
    email: string;
    displayName?: string | null;
    providerSubject?: string | null;
    allowlists: { adminEmails: readonly string[]; editorEmails: readonly string[] };
  },
): Promise<{ user: UserWithRoles; allowlistedRole: AllowlistedRole | null }> {
  const allowlistedRole = pickAllowlistedRole(input.email, input.allowlists);
  const user = await upsertUserFromOidc(db, input);
  if (!allowlistedRole) return { user, allowlistedRole: null };
  const roles = await ensureDefaultRoles(db);
  await ensureUserRole(db, { userId: user.id, roleId: roles[allowlistedRole] });
  const refreshed = await db.user.findUniqueOrThrow<UserWithRoles>({
    where: { id: user.id },
    include: { roles: { include: { role: true } } },
  });
  return { user: refreshed, allowlistedRole };
}

export const DEFAULT_SYSTEM_ACTOR_EMAIL = 'system@synac.app';

export async function ensureSystemActor(db: DbClientLike, input?: { email?: string }): Promise<UserWithRoles> {
  const roles = await ensureDefaultRoles(db);
  const email = (input?.email ?? DEFAULT_SYSTEM_ACTOR_EMAIL).trim().toLowerCase();
  const user = await db.user.upsert<UserWithRoles>({
    where: { email },
    update: { status: 'ACTIVE', authProvider: 'LOCAL', displayName: 'SynAc System' },
    create: { email, status: 'ACTIVE', authProvider: 'LOCAL', displayName: 'SynAc System' },
    include: { roles: { include: { role: true } } },
  });
  await ensureUserRole(db, { userId: user.id, roleId: roles.ADMIN });
  return db.user.findUniqueOrThrow<UserWithRoles>({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
}

export type AutoTagDefinition = {
  name: string;
  slug: string;
  description: string;
  patterns: RegExp[];
};

export const AUTO_TAG_DEFINITIONS: AutoTagDefinition[] = [
  {
    name: 'Identity',
    slug: 'identity',
    description: 'Authentication, authorization, federation, and identity systems.',
    patterns: [/\bauthentication\b/i, /\bauthorization\b/i, /\boauth\b/i, /\boidc\b/i, /\bsaml\b/i, /\bmfa\b/i],
  },
  {
    name: 'Application Security',
    slug: 'application-security',
    description: 'Web/app vulnerabilities and secure coding concepts.',
    patterns: [/\bvulnerability\b/i, /\bexploit\b/i, /\binjection\b/i, /\bxss\b/i, /\bcsrf\b/i, /\bssrf\b/i],
  },
  {
    name: 'Cryptography',
    slug: 'cryptography',
    description: 'Encryption, keys, cryptographic primitives, and certificates.',
    patterns: [/\bcryptograph/i, /\bencrypt/i, /\bhash\b/i, /\bcertificate\b/i, /\bpki\b/i, /\btls\b/i],
  },
];

export function collectAutoTagSlugsForDocument(document: string): string[] {
  const normalized = document.trim();
  if (!normalized) return [];
  return AUTO_TAG_DEFINITIONS.filter((definition) =>
    definition.patterns.some((pattern) => pattern.test(normalized)),
  ).map((definition) => definition.slug);
}

export function shouldCreateAutoTagDefinition(existing: { deletedAt: Date | null } | null): boolean {
  return existing === null;
}

export async function syncAutoTagsForPublishedEntry(
  db: DbClientLike,
  input: { entryId: string },
): Promise<{ matchedSlugs: string[]; createdSlugs: string[] }> {
  const entry = await db.entry.findFirst<{
    id: string;
    status: string;
    summaryText: string | null;
    summaryMd: string | null;
  }>({
    where: { id: input.entryId, status: 'PUBLISHED', deletedAt: null },
    select: { id: true, status: true, summaryText: true, summaryMd: true },
  });
  if (!entry) return { matchedSlugs: [], createdSlugs: [] };
  const senses = await db.sense.findMany<{ definitionText: string | null; definitionMd: string | null }>({
    where: { entryId: input.entryId, deletedAt: null },
    select: { definitionText: true, definitionMd: true },
  });
  const document = [entry.summaryText, entry.summaryMd, ...senses.flatMap((sense) => [sense.definitionText, sense.definitionMd])]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
  const matchedSlugs = collectAutoTagSlugsForDocument(document);
  const createdSlugs: string[] = [];
  for (const definition of AUTO_TAG_DEFINITIONS.filter((item) => matchedSlugs.includes(item.slug))) {
    const tag = await db.tag.upsert<{ id: string; slug: string }>({
      where: { slug: definition.slug },
      update: {},
      create: { name: definition.name, slug: definition.slug, description: definition.description },
    });
    await db.entryTag.upsert({
      where: { entryId_tagId: { entryId: input.entryId, tagId: tag.id } },
      update: {},
      create: { entryId: input.entryId, tagId: tag.id },
    });
    createdSlugs.push(tag.slug);
  }
  return { matchedSlugs, createdSlugs };
}

export async function createIngestRun(input: {
  actorUserId: string;
  sourceId: string;
  maxItems: number;
  forceReprocess: boolean;
}): Promise<{ ingestRunId: string }> {
  return createConvexIngestRun(input);
}
