import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRequestId } from './apiErrors';

/**
 * Request-body schemas for every admin route, plus the schemas that guard JSON
 * we persist (`sourceLocator`, `proposedChange`) and the enums we read back out
 * of audit snapshots.
 *
 * Routes call `parseBody`, which either hands back typed data or a 400
 * `{ error: 'invalid_body', issues }` response.
 */

const trimmed = z.string().trim();
const nonEmpty = trimmed.min(1);
const uuid = trimmed.uuid();

/** Optional free text: absent, null, and `''` all collapse to `undefined`. */
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    const v = typeof value === 'string' ? value.trim() : '';
    return v ? v : undefined;
  });

const entryTypeSchema = z.enum(['TERM', 'ACRONYM']);
/** Mirrors the Prisma `EntryStatus` enum; a snapshot naming anything else is not restorable. */
const entryStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
const contentModeSchema = z.enum(['QUOTED', 'SUMMARIZED', 'PARAPHRASED']);
const licenseTypeSchema = z.enum([
  'PUBLIC_DOMAIN',
  'CC_BY_4_0',
  'CC_BY_SA_4_0',
  'CC0_1_0',
  'PROPRIETARY',
  'OTHER',
]);
const trustTierSchema = z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4']);
const accessMethodSchema = z.enum(['API', 'RSS', 'HTML', 'PDF', 'OTHER']);
const robotsPolicySchema = z.enum(['RESPECT', 'EXPLICIT_PERMISSION']);
const tagKindSchema = z.enum(['DOMAIN', 'FACET']);
const variantTypeSchema = z.enum([
  'ALIAS',
  'SYNONYM',
  'ABBREVIATION',
  'MISSPELLING',
]);

export const createEntryBodySchema = z.object({
  entryType: entryTypeSchema,
  displayTitle: nonEmpty.max(400),
  primarySlug: optionalText,
});

export const patchEntryBodySchema = z.object({
  displayTitle: nonEmpty.max(400),
  primarySlug: trimmed.max(400).default(''),
  summaryMd: z.string().max(20_000).default(''),
  editorialNotes: z.string().max(20_000).default(''),
});

export const rollbackEntryBodySchema = z.object({
  auditEventId: uuid.optional(),
});

const sourceCoreSchema = z.object({
  name: nonEmpty.max(300),
  sourceSlug: nonEmpty.max(200),
  baseUrl: nonEmpty.url().max(2000),
  cronSchedule: optionalText,
  licenseType: licenseTypeSchema,
  licenseNotes: optionalText,
  licenseUrl: optionalText,
  licensePublicStatement: optionalText,
  attributionHtml: optionalText,
  tierRationale: optionalText,
  snapshotAllowed: z.boolean().optional(),
  defaultContentMode: contentModeSchema.optional(),
  allowedUse: nonEmpty.max(5000),
  attributionRequirements: nonEmpty.max(5000),
  accessMethod: accessMethodSchema,
  robotsPolicy: robotsPolicySchema,
  rateLimitPolicy: optionalText,
  contact: optionalText,
  lastVerifiedAt: trimmed
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  trustTier: trustTierSchema,
  notesInternal: optionalText,
});

export const createSourceBodySchema = sourceCoreSchema.extend({
  enabled: z.boolean().default(false),
});

export const patchSourceBodySchema = sourceCoreSchema;

export const createTagBodySchema = z.object({
  name: nonEmpty.max(200),
  slug: optionalText,
  description: optionalText,
  kind: tagKindSchema.optional(),
  parentId: uuid.optional().nullable(),
});

export const patchTagBodySchema = z.object({
  name: nonEmpty.max(200),
  slug: nonEmpty.max(200),
  description: optionalText,
  kind: tagKindSchema.optional(),
  parentId: uuid.optional().nullable(),
});

export const mergeTagBodySchema = z.object({
  intoTagId: uuid,
});

export const createIngestRunBodySchema = z.object({
  sourceId: trimmed.max(100).optional(),
  maxItems: z.coerce.number().int().min(1).max(1000).default(100),
  forceReprocess: z.boolean().default(false),
});

export const approveIngestItemBodySchema = z
  .object({
    attachThreshold: z.coerce.number().min(0).max(1).optional(),
  })
  .loose();

export const rejectIngestItemBodySchema = z.object({
  reason: nonEmpty.max(2000),
});

/**
 * `sourceLocator` points at the fragment of a source document a definition came
 * from. It is written straight into a Prisma `Json` column, so it has to be a
 * bounded, null-free object rather than arbitrary user JSON.
 */
export const sourceLocatorSchema = z
  .object({
    page: z.union([z.number().int().min(0), z.string().max(50)]).optional(),
    selector: z.string().max(1000).optional(),
    anchor: z.string().max(500).optional(),
    section: z.string().max(500).optional(),
    xpath: z.string().max(1000).optional(),
    charStart: z.number().int().min(0).optional(),
    charEnd: z.number().int().min(0).optional(),
    quote: z.string().max(4000).optional(),
  })
  .loose();

const proposedSenseSchema = z.object({
  senseLabel: optionalText,
  expandedForm: optionalText,
  definitionMd: z.string().max(50_000).default(''),
  contentMode: z.string().max(50).optional(),
  extractionMethod: z.string().max(50).optional(),
  extractorVersion: z.string().max(200).optional(),
  sourceLocator: z.unknown().optional(),
});

const proposedVariantSchema = z.object({
  variantText: nonEmpty.max(400),
  variantType: variantTypeSchema.catch('ALIAS').default('ALIAS'),
});

export const proposedChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('CREATE_ENTRY'),
    entryType: entryTypeSchema.catch('TERM'),
    displayTitle: nonEmpty.max(400),
    primarySlug: optionalText,
    summaryMd: z.string().max(50_000).default(''),
    variants: z.array(proposedVariantSchema).max(200).optional(),
    senses: z.array(proposedSenseSchema).min(1).max(100),
  }),
  z.object({
    kind: z.literal('ADD_SENSES'),
    entryId: uuid,
    entryType: entryTypeSchema.catch('TERM'),
    displayTitle: nonEmpty.max(400),
    summaryMd: z.string().max(50_000).optional(),
    variants: z.array(proposedVariantSchema).max(200).optional(),
    senses: z.array(proposedSenseSchema).min(1).max(100),
  }),
]);

/** The subset of an `AuditEvent.before` snapshot that entry rollback restores. */
export const entryRollbackSnapshotSchema = z
  .object({
    displayTitle: z.string().optional(),
    normalizedTitle: z.string().optional(),
    primarySlug: z.string().optional(),
    status: entryStatusSchema.optional(),
    summaryMd: z.string().nullable().optional(),
    summaryText: z.string().nullable().optional(),
    editorialNotes: z.string().nullable().optional(),
    publishedAt: z.union([z.string(), z.null()]).optional(),
  })
  .loose();
export type EntryRollbackSnapshot = z.infer<typeof entryRollbackSnapshotSchema>;

type ParseBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/** The subset of a zod issue the 400 body reports back. */
type BodyIssue = { path: PropertyKey[]; message: string };

function invalidBody(
  request: Request,
  issues: readonly BodyIssue[],
): NextResponse {
  return NextResponse.json(
    { error: 'invalid_body', issues, requestId: getRequestId(request) },
    { status: 400 },
  );
}

/**
 * Read and validate a JSON request body. Both a malformed body and a schema
 * failure produce the same 400 shape, so callers only branch once.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseBodyResult<T>> {
  let raw: unknown;

  try {
    const text = await request.text();
    raw = text.trim() ? (JSON.parse(text) as unknown) : {};
  } catch {
    return {
      ok: false,
      response: invalidBody(request, [
        { path: [], message: 'Body must be valid JSON' },
      ]),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: invalidBody(request, result.error.issues) };
  }

  return { ok: true, data: result.data };
}
