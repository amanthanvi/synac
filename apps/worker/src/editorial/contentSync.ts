import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import type { Prisma, PrismaClient } from '@synac/db';
import { ensureSystemActor, toJsonSafe } from '@synac/db';

import { logger } from '../logger.js';

const ENTRY_TYPES = ['TERM', 'ACRONYM'] as const;
export type ContentEntryType = (typeof ENTRY_TYPES)[number];

const RELATIONSHIP_TYPES = [
  'RELATED',
  'BROADER_THAN',
  'NARROWER_THAN',
  'OFTEN_CONFUSED_WITH',
  'SEE_ALSO',
] as const;
export type RelationshipTypeString = (typeof RELATIONSHIP_TYPES)[number];

const TAG_ASSIGNED_BY = 'EDITORIAL' as const;

const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

export type ContentConfusedWithDoc = {
  slug: string;
  entryType: ContentEntryType;
  note?: string;
};

export type ContentSenseDoc = {
  slug: string;
  label?: string;
  disambiguationNote?: string;
  preferred?: boolean;
  confusedWith?: ContentConfusedWithDoc[];
};

export type ContentTagDoc = {
  slug: string;
  assignedBy: 'EDITORIAL';
};

export type ContentRelationshipDoc = {
  type: RelationshipTypeString;
  targetSlug: string;
  targetEntryType: ContentEntryType;
  note?: string;
};

export type ContentEntryDoc = {
  entryType: ContentEntryType;
  slug: string;
  senses?: ContentSenseDoc[];
  tags?: ContentTagDoc[];
  relationships?: ContentRelationshipDoc[];
};

export type ContentValidationResult =
  | { ok: true; value: ContentEntryDoc }
  | { ok: false; errors: string[] };

export type ContentSyncResult = {
  filesScanned: number;
  filesValid: number;
  filesInvalid: number;
  entriesMatched: number;
  entriesSkipped: number;
  changesApplied: number;
  errors: Array<{ file: string; message: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContentEntryType(value: unknown): value is ContentEntryType {
  return ENTRY_TYPES.some((candidate) => candidate === value);
}

function isRelationshipType(value: unknown): value is RelationshipTypeString {
  return RELATIONSHIP_TYPES.some((candidate) => candidate === value);
}

function readRequiredString(
  value: unknown,
  field: string,
  errors: string[],
): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} is required and must be a non-empty string`);
    return undefined;
  }
  return value;
}

function readOptionalString(
  value: unknown,
  field: string,
  errors: string[],
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }
  return value;
}

function readOptionalBoolean(
  value: unknown,
  field: string,
  errors: string[],
): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    errors.push(`${field} must be a boolean`);
    return undefined;
  }
  return value;
}

function readOptionalArray(
  value: unknown,
  field: string,
  errors: string[],
): unknown[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return undefined;
  }
  // `Array.isArray` narrows to `any[]`; the elements are unvalidated YAML, and
  // each one is checked by the per-item parser that receives it.
  return value as unknown[];
}

function rejectUnknownKeys(
  keys: readonly string[],
  allowed: readonly string[],
  field: string,
  errors: string[],
): void {
  for (const key of keys) {
    if (!allowed.includes(key)) {
      errors.push(`${field}.${key} is not a recognized field`);
    }
  }
}

function parseConfusedWith(
  raw: unknown,
  field: string,
  errors: string[],
): ContentConfusedWithDoc | undefined {
  if (!isRecord(raw)) {
    errors.push(`${field} must be a mapping`);
    return undefined;
  }
  rejectUnknownKeys(
    Object.keys(raw),
    ['slug', 'entryType', 'note'],
    field,
    errors,
  );

  const slug = readRequiredString(raw.slug, `${field}.slug`, errors);
  const note = readOptionalString(raw.note, `${field}.note`, errors);
  if (!isContentEntryType(raw.entryType)) {
    errors.push(`${field}.entryType must be one of ${ENTRY_TYPES.join(', ')}`);
    return undefined;
  }
  if (slug === undefined) return undefined;

  const doc: ContentConfusedWithDoc = { slug, entryType: raw.entryType };
  if (note !== undefined) doc.note = note;
  return doc;
}

function parseSense(
  raw: unknown,
  field: string,
  errors: string[],
): ContentSenseDoc | undefined {
  if (!isRecord(raw)) {
    errors.push(`${field} must be a mapping`);
    return undefined;
  }
  rejectUnknownKeys(
    Object.keys(raw),
    ['slug', 'label', 'disambiguationNote', 'preferred', 'confusedWith'],
    field,
    errors,
  );

  const slug = readRequiredString(raw.slug, `${field}.slug`, errors);
  const label = readOptionalString(raw.label, `${field}.label`, errors);
  const disambiguationNote = readOptionalString(
    raw.disambiguationNote,
    `${field}.disambiguationNote`,
    errors,
  );
  const preferred = readOptionalBoolean(
    raw.preferred,
    `${field}.preferred`,
    errors,
  );

  const confusedWithRaw = readOptionalArray(
    raw.confusedWith,
    `${field}.confusedWith`,
    errors,
  );
  let confusedWith: ContentConfusedWithDoc[] | undefined;
  if (confusedWithRaw) {
    confusedWith = [];
    for (const [index, item] of confusedWithRaw.entries()) {
      const parsed = parseConfusedWith(
        item,
        `${field}.confusedWith[${index}]`,
        errors,
      );
      if (parsed) confusedWith.push(parsed);
    }
  }

  if (slug === undefined) return undefined;

  const sense: ContentSenseDoc = { slug };
  if (label !== undefined) sense.label = label;
  if (disambiguationNote !== undefined)
    sense.disambiguationNote = disambiguationNote;
  if (preferred !== undefined) sense.preferred = preferred;
  if (confusedWith !== undefined) sense.confusedWith = confusedWith;
  return sense;
}

function parseTag(
  raw: unknown,
  field: string,
  errors: string[],
): ContentTagDoc | undefined {
  if (!isRecord(raw)) {
    errors.push(`${field} must be a mapping`);
    return undefined;
  }
  rejectUnknownKeys(Object.keys(raw), ['slug', 'assignedBy'], field, errors);

  const slug = readRequiredString(raw.slug, `${field}.slug`, errors);
  if (raw.assignedBy !== undefined && raw.assignedBy !== TAG_ASSIGNED_BY) {
    errors.push(
      `${field}.assignedBy must be "${TAG_ASSIGNED_BY}" when present`,
    );
    return undefined;
  }
  if (slug === undefined) return undefined;

  return { slug, assignedBy: TAG_ASSIGNED_BY };
}

function parseRelationship(
  raw: unknown,
  field: string,
  errors: string[],
): ContentRelationshipDoc | undefined {
  if (!isRecord(raw)) {
    errors.push(`${field} must be a mapping`);
    return undefined;
  }
  rejectUnknownKeys(
    Object.keys(raw),
    ['type', 'targetSlug', 'targetEntryType', 'note'],
    field,
    errors,
  );

  const targetSlug = readRequiredString(
    raw.targetSlug,
    `${field}.targetSlug`,
    errors,
  );
  const note = readOptionalString(raw.note, `${field}.note`, errors);

  const rawType: unknown = raw.type;
  const rawTargetEntryType: unknown = raw.targetEntryType;
  const type = isRelationshipType(rawType) ? rawType : undefined;
  const targetEntryType = isContentEntryType(rawTargetEntryType)
    ? rawTargetEntryType
    : undefined;

  if (type === undefined) {
    errors.push(
      `${field}.type must be one of ${RELATIONSHIP_TYPES.join(', ')}`,
    );
  }
  if (targetEntryType === undefined) {
    errors.push(
      `${field}.targetEntryType must be one of ${ENTRY_TYPES.join(', ')}`,
    );
  }
  if (
    type === undefined ||
    targetEntryType === undefined ||
    targetSlug === undefined
  ) {
    return undefined;
  }

  const relationship: ContentRelationshipDoc = {
    type,
    targetSlug,
    targetEntryType,
  };
  if (note !== undefined) relationship.note = note;
  return relationship;
}

export function parseContentEntryDocument(
  text: string,
  filePath: string,
): ContentValidationResult {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`${filePath}: YAML parse error: ${message}`] };
  }

  const errors: string[] = [];

  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: [`${filePath}: document root must be a YAML mapping`],
    };
  }

  rejectUnknownKeys(
    Object.keys(raw),
    ['entryType', 'slug', 'senses', 'tags', 'relationships'],
    'document',
    errors,
  );

  const slug = readRequiredString(raw.slug, 'slug', errors);

  const rawEntryType: unknown = raw.entryType;
  const entryType = isContentEntryType(rawEntryType) ? rawEntryType : undefined;
  if (entryType === undefined) {
    errors.push(
      `entryType is required and must be one of ${ENTRY_TYPES.join(', ')}`,
    );
  }

  const sensesRaw = readOptionalArray(raw.senses, 'senses', errors);
  let senses: ContentSenseDoc[] | undefined;
  if (sensesRaw) {
    senses = [];
    for (const [index, item] of sensesRaw.entries()) {
      const parsed = parseSense(item, `senses[${index}]`, errors);
      if (parsed) senses.push(parsed);
    }
  }

  const tagsRaw = readOptionalArray(raw.tags, 'tags', errors);
  let tags: ContentTagDoc[] | undefined;
  if (tagsRaw) {
    tags = [];
    for (const [index, item] of tagsRaw.entries()) {
      const parsed = parseTag(item, `tags[${index}]`, errors);
      if (parsed) tags.push(parsed);
    }
  }

  const relationshipsRaw = readOptionalArray(
    raw.relationships,
    'relationships',
    errors,
  );
  let relationships: ContentRelationshipDoc[] | undefined;
  if (relationshipsRaw) {
    relationships = [];
    for (const [index, item] of relationshipsRaw.entries()) {
      const parsed = parseRelationship(item, `relationships[${index}]`, errors);
      if (parsed) relationships.push(parsed);
    }
  }

  if (errors.length > 0 || slug === undefined || entryType === undefined) {
    return {
      ok: false,
      errors: errors.map((message) => `${filePath}: ${message}`),
    };
  }

  const value: ContentEntryDoc = { entryType, slug };
  if (senses !== undefined) value.senses = senses;
  if (tags !== undefined) value.tags = tags;
  if (relationships !== undefined) value.relationships = relationships;
  return { ok: true, value };
}

/**
 * Repo-root `content` directory. `apps/worker/src/editorial` and
 * `apps/worker/dist/editorial` sit at the same depth, so a fixed four-level
 * ascent resolves correctly whether running from source or from the build.
 */
export function resolveDefaultContentDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', '..', 'content');
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isInsideContentDir(candidate: string, contentDir: string): boolean {
  return path.resolve(candidate).startsWith(contentDir + path.sep);
}

async function walkYamlFiles(
  dir: string,
  contentDir: string,
  out: string[],
): Promise<void> {
  const dirents = await readdir(dir, { withFileTypes: true });

  for (const dirent of dirents) {
    const candidate = path.resolve(dir, dirent.name);

    if (!isInsideContentDir(candidate, contentDir)) {
      logger.warn('editorial.sync.path_rejected', {
        path: candidate,
        contentDir,
      });
      continue;
    }

    if (dirent.isSymbolicLink()) {
      logger.warn('editorial.sync.path_rejected', {
        path: candidate,
        reason: 'symlink',
      });
      continue;
    }

    if (dirent.isDirectory()) {
      await walkYamlFiles(candidate, contentDir, out);
      continue;
    }

    if (
      dirent.isFile() &&
      YAML_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())
    ) {
      out.push(candidate);
    }
  }
}

async function collectYamlFiles(contentDir: string): Promise<string[] | null> {
  const files: string[] = [];
  try {
    await walkYamlFiles(contentDir, contentDir, files);
  } catch (error) {
    if (isEnoent(error)) return null;
    throw error;
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

/** The shape of every row this file snapshots into `audit_events.before/after`. */
type AuditSnapshot = Record<string, string | boolean | null>;

async function writeAuditEvent(
  db: PrismaClient,
  params: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: AuditSnapshot;
    after?: AuditSnapshot;
  },
): Promise<void> {
  const data: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  } = {
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
  };

  if (params.before !== undefined) data.before = toJsonSafe(params.before);
  if (params.after !== undefined) data.after = toJsonSafe(params.after);

  await db.auditEvent.create({ data });
}

const SENSE_AUDIT_SELECT = {
  id: true,
  entryId: true,
  slug: true,
  senseLabel: true,
  disambiguationNote: true,
  isPreferred: true,
} as const;

type ApplyContext = {
  db: PrismaClient;
  file: string;
  entryId: string;
  entryType: ContentEntryType;
  entrySlug: string;
  actorUserId: string;
};

async function ensureRelationship(
  ctx: ApplyContext,
  params: {
    relationshipType: RelationshipTypeString;
    targetSlug: string;
    targetEntryType: ContentEntryType;
    note?: string;
  },
): Promise<number> {
  const target = await ctx.db.entry.findFirst({
    where: {
      entryType: params.targetEntryType,
      primarySlug: params.targetSlug,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!target) {
    logger.info('editorial.sync.entry_skipped', {
      file: ctx.file,
      entryType: params.targetEntryType,
      slug: params.targetSlug,
      reason: 'relationship_target_not_found',
    });
    return 0;
  }

  if (target.id === ctx.entryId) {
    logger.info('editorial.sync.entry_skipped', {
      file: ctx.file,
      entryType: params.targetEntryType,
      slug: params.targetSlug,
      reason: 'relationship_target_is_self',
    });
    return 0;
  }

  const existing = await ctx.db.entryRelationship.findFirst({
    where: {
      fromEntryId: ctx.entryId,
      toEntryId: target.id,
      relationshipType: params.relationshipType,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) return 0;

  const created = await ctx.db.entryRelationship.create({
    data: {
      fromEntryId: ctx.entryId,
      toEntryId: target.id,
      relationshipType: params.relationshipType,
      note: params.note ?? null,
      createdByUserId: ctx.actorUserId,
    },
    select: {
      id: true,
      fromEntryId: true,
      toEntryId: true,
      relationshipType: true,
      note: true,
    },
  });

  await writeAuditEvent(ctx.db, {
    actorUserId: ctx.actorUserId,
    action: 'ENTRY_RELATIONSHIP_CREATE',
    entityType: 'ENTRY',
    entityId: ctx.entryId,
    after: created,
  });

  logger.info('editorial.sync.changed', {
    file: ctx.file,
    change: 'entry_relationship_create',
    entryId: ctx.entryId,
    relationshipType: params.relationshipType,
    targetSlug: params.targetSlug,
  });

  return 1;
}

async function applySense(
  ctx: ApplyContext,
  sense: ContentSenseDoc,
): Promise<number> {
  const existing = await ctx.db.sense.findFirst({
    where: { entryId: ctx.entryId, slug: sense.slug, deletedAt: null },
    select: SENSE_AUDIT_SELECT,
  });

  if (!existing) {
    logger.info('editorial.sync.entry_skipped', {
      file: ctx.file,
      entryType: ctx.entryType,
      slug: ctx.entrySlug,
      senseSlug: sense.slug,
      reason: 'sense_not_found',
    });
    return 0;
  }

  let changes = 0;

  const data: {
    senseLabel?: string;
    disambiguationNote?: string;
    isPreferred?: boolean;
  } = {};
  if (sense.label !== undefined && sense.label !== existing.senseLabel) {
    data.senseLabel = sense.label;
  }
  if (
    sense.disambiguationNote !== undefined &&
    sense.disambiguationNote !== existing.disambiguationNote
  ) {
    data.disambiguationNote = sense.disambiguationNote;
  }
  if (
    sense.preferred !== undefined &&
    sense.preferred !== existing.isPreferred
  ) {
    data.isPreferred = sense.preferred;
  }

  if (Object.keys(data).length > 0) {
    const updated = await ctx.db.sense.update({
      where: { id: existing.id },
      data,
      select: SENSE_AUDIT_SELECT,
    });

    await writeAuditEvent(ctx.db, {
      actorUserId: ctx.actorUserId,
      action: 'SENSE_UPDATE',
      entityType: 'SENSE',
      entityId: existing.id,
      before: existing,
      after: updated,
    });

    logger.info('editorial.sync.changed', {
      file: ctx.file,
      change: 'sense_update',
      senseId: existing.id,
      fields: Object.keys(data),
    });

    changes += 1;
  }

  if (sense.preferred === true) {
    const siblings = await ctx.db.sense.findMany({
      where: {
        entryId: ctx.entryId,
        deletedAt: null,
        isPreferred: true,
        id: { not: existing.id },
      },
      select: SENSE_AUDIT_SELECT,
    });

    if (siblings.length > 0) {
      await ctx.db.sense.updateMany({
        where: { id: { in: siblings.map((sibling) => sibling.id) } },
        data: { isPreferred: false },
      });

      for (const sibling of siblings) {
        await writeAuditEvent(ctx.db, {
          actorUserId: ctx.actorUserId,
          action: 'SENSE_UPDATE',
          entityType: 'SENSE',
          entityId: sibling.id,
          before: sibling,
          after: { ...sibling, isPreferred: false },
        });

        logger.info('editorial.sync.changed', {
          file: ctx.file,
          change: 'sense_demoted',
          senseId: sibling.id,
        });

        changes += 1;
      }
    }
  }

  for (const confused of sense.confusedWith ?? []) {
    changes += await ensureRelationship(ctx, {
      relationshipType: 'OFTEN_CONFUSED_WITH',
      targetSlug: confused.slug,
      targetEntryType: confused.entryType,
      note: confused.note,
    });
  }

  return changes;
}

async function applyTag(
  ctx: ApplyContext,
  tag: ContentTagDoc,
): Promise<number> {
  const existingTag = await ctx.db.tag.findFirst({
    where: { slug: tag.slug, deletedAt: null },
    select: { id: true },
  });

  if (!existingTag) {
    logger.info('editorial.sync.entry_skipped', {
      file: ctx.file,
      entryType: ctx.entryType,
      slug: ctx.entrySlug,
      tagSlug: tag.slug,
      reason: 'tag_not_found',
    });
    return 0;
  }

  const existingEntryTag = await ctx.db.entryTag.findUnique({
    where: { entryId_tagId: { entryId: ctx.entryId, tagId: existingTag.id } },
    select: { entryId: true, tagId: true, assignedBy: true },
  });

  if (existingEntryTag && existingEntryTag.assignedBy === tag.assignedBy) {
    return 0;
  }

  const updated = await ctx.db.entryTag.upsert({
    where: { entryId_tagId: { entryId: ctx.entryId, tagId: existingTag.id } },
    create: {
      entryId: ctx.entryId,
      tagId: existingTag.id,
      assignedBy: tag.assignedBy,
    },
    update: { assignedBy: tag.assignedBy },
    select: { entryId: true, tagId: true, assignedBy: true },
  });

  const audit: Parameters<typeof writeAuditEvent>[1] = {
    actorUserId: ctx.actorUserId,
    action: 'ENTRY_TAG_UPDATE',
    entityType: 'ENTRY',
    entityId: ctx.entryId,
    after: updated,
  };
  if (existingEntryTag !== null) audit.before = existingEntryTag;

  await writeAuditEvent(ctx.db, audit);

  logger.info('editorial.sync.changed', {
    file: ctx.file,
    change: 'entry_tag_update',
    entryId: ctx.entryId,
    tagSlug: tag.slug,
  });

  return 1;
}

async function applyDocument(
  ctx: ApplyContext,
  doc: ContentEntryDoc,
): Promise<number> {
  let changes = 0;

  for (const sense of doc.senses ?? []) {
    changes += await applySense(ctx, sense);
  }

  for (const tag of doc.tags ?? []) {
    changes += await applyTag(ctx, tag);
  }

  for (const relationship of doc.relationships ?? []) {
    changes += await ensureRelationship(ctx, {
      relationshipType: relationship.type,
      targetSlug: relationship.targetSlug,
      targetEntryType: relationship.targetEntryType,
      note: relationship.note,
    });
  }

  return changes;
}

export async function syncContentDirectory(
  db: PrismaClient,
  input?: { contentDir?: string; actorUserId?: string },
): Promise<ContentSyncResult> {
  const contentDir = path.resolve(
    input?.contentDir ?? resolveDefaultContentDir(),
  );

  const result: ContentSyncResult = {
    filesScanned: 0,
    filesValid: 0,
    filesInvalid: 0,
    entriesMatched: 0,
    entriesSkipped: 0,
    changesApplied: 0,
    errors: [],
  };

  logger.info('editorial.sync.start', { contentDir });

  const files = await collectYamlFiles(contentDir);

  if (files === null) {
    logger.warn('editorial.sync.done', {
      contentDir,
      reason: 'content_dir_missing',
      ...result,
    });
    return result;
  }

  let resolvedActorUserId: string | null = input?.actorUserId ?? null;
  const resolveActorUserId = async (): Promise<string> => {
    if (resolvedActorUserId !== null) return resolvedActorUserId;
    const system = await ensureSystemActor(db);
    resolvedActorUserId = system.id;
    return resolvedActorUserId;
  };

  for (const file of files) {
    result.filesScanned += 1;

    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.filesInvalid += 1;
      result.errors.push({ file, message: `unable to read file: ${message}` });
      logger.warn('editorial.sync.file_invalid', { file, message });
      continue;
    }

    const parsed = parseContentEntryDocument(text, file);
    if (!parsed.ok) {
      result.filesInvalid += 1;
      for (const message of parsed.errors) {
        result.errors.push({ file, message });
      }
      logger.warn('editorial.sync.file_invalid', {
        file,
        errors: parsed.errors,
      });
      continue;
    }

    result.filesValid += 1;
    const doc = parsed.value;

    const entry = await db.entry.findFirst({
      where: {
        entryType: doc.entryType,
        primarySlug: doc.slug,
        deletedAt: null,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });

    if (!entry) {
      result.entriesSkipped += 1;
      logger.info('editorial.sync.entry_skipped', {
        file,
        entryType: doc.entryType,
        slug: doc.slug,
        reason: 'entry_not_found',
      });
      continue;
    }

    result.entriesMatched += 1;

    try {
      const actorUserId = await resolveActorUserId();
      result.changesApplied += await applyDocument(
        {
          db,
          file,
          entryId: entry.id,
          entryType: doc.entryType,
          entrySlug: doc.slug,
          actorUserId,
        },
        doc,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ file, message });
      logger.error('editorial.sync.file_invalid', { file, message });
    }
  }

  logger.info('editorial.sync.done', { contentDir, ...result });

  return result;
}
