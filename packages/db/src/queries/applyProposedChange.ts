import { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';
import { toJsonSafe } from '../json.js';
import { markdownToText, normalizeTitle, slugify } from '../text.js';
import { syncAutoTagsForPublishedEntry } from './autoTagging.js';

type ProposedSense = {
  senseLabel?: string;
  expandedForm?: string;
  definitionMd: string;
  contentMode?: string;
  extractionMethod?: string;
  extractorVersion?: string;
  sourceLocator?: Prisma.JsonValue;
};

type ProposedVariant = {
  variantText: string;
  variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' | 'MISSPELLING';
};

type ProposedRelationshipType =
  | 'RELATED'
  | 'BROADER_THAN'
  | 'NARROWER_THAN'
  | 'OFTEN_CONFUSED_WITH'
  | 'SEE_ALSO';

type ProposedRelationship = {
  type: ProposedRelationshipType;
  targetTitle: string;
  note?: string;
};

type ProposedChange = {
  kind: 'CREATE_ENTRY' | 'ADD_SENSES';
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug?: string;
  summaryMd?: string;
  variants: ProposedVariant[];
  /** Tag slugs assigned by the ingest pipeline (`EntryTag.assignedBy = 'INGEST'`). */
  tags: string[];
  relationships: ProposedRelationship[];
  senses: ProposedSense[];
};

function asJsonObject(
  value: Prisma.JsonValue | undefined,
): Prisma.JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function asString(value: Prisma.JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseEntryType(
  value: Prisma.JsonValue | undefined,
): 'TERM' | 'ACRONYM' {
  return value === 'ACRONYM' ? 'ACRONYM' : 'TERM';
}

function parseVariantType(
  value: Prisma.JsonValue | undefined,
): ProposedVariant['variantType'] {
  if (
    value === 'SYNONYM' ||
    value === 'ABBREVIATION' ||
    value === 'MISSPELLING'
  )
    return value;
  return 'ALIAS';
}

function parseRelationshipType(
  value: Prisma.JsonValue | undefined,
): ProposedRelationshipType | null {
  if (
    value === 'RELATED' ||
    value === 'BROADER_THAN' ||
    value === 'NARROWER_THAN' ||
    value === 'OFTEN_CONFUSED_WITH' ||
    value === 'SEE_ALSO'
  ) {
    return value;
  }
  return null;
}

function parseSenses(value: Prisma.JsonValue | undefined): ProposedSense[] {
  if (!Array.isArray(value)) return [];

  const out: ProposedSense[] = [];
  for (const raw of value) {
    const sense = asJsonObject(raw);
    if (!sense) continue;

    out.push({
      senseLabel: asString(sense.senseLabel),
      expandedForm: asString(sense.expandedForm),
      definitionMd: asString(sense.definitionMd) ?? '',
      contentMode: asString(sense.contentMode),
      extractionMethod: asString(sense.extractionMethod),
      extractorVersion: asString(sense.extractorVersion),
      sourceLocator: sense.sourceLocator,
    });
  }

  return out;
}

function parseVariants(value: Prisma.JsonValue | undefined): ProposedVariant[] {
  if (!Array.isArray(value)) return [];

  const out: ProposedVariant[] = [];
  for (const raw of value) {
    const variant = asJsonObject(raw);
    if (!variant) continue;

    const variantText = asString(variant.variantText)?.trim();
    if (!variantText) continue;

    out.push({
      variantText,
      variantType: parseVariantType(variant.variantType),
    });
  }

  return out;
}

function parseTags(value: Prisma.JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const slug = asString(raw)?.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }

  return out;
}

function parseRelationships(
  value: Prisma.JsonValue | undefined,
): ProposedRelationship[] {
  if (!Array.isArray(value)) return [];

  const out: ProposedRelationship[] = [];
  for (const raw of value) {
    const row = asJsonObject(raw);
    if (!row) continue;

    const type = parseRelationshipType(row.type);
    if (!type) continue;

    const targetTitle = asString(row.targetTitle)?.trim();
    if (!targetTitle) continue;

    const relationship: ProposedRelationship = { type, targetTitle };
    const note = asString(row.note)?.trim();
    if (note) relationship.note = note;

    out.push(relationship);
  }

  return out;
}

function parseProposedChange(value: Prisma.JsonValue | null): ProposedChange {
  const v = asJsonObject(value ?? undefined);
  if (!v) throw new Error('Invalid proposedChange');
  if (v.kind !== 'CREATE_ENTRY' && v.kind !== 'ADD_SENSES') {
    throw new Error('Unsupported proposedChange.kind');
  }

  return {
    kind: v.kind,
    entryType: parseEntryType(v.entryType),
    displayTitle: asString(v.displayTitle) ?? '',
    primarySlug: asString(v.primarySlug),
    summaryMd: asString(v.summaryMd),
    variants: parseVariants(v.variants),
    tags: parseTags(v.tags),
    relationships: parseRelationships(v.relationships),
    senses: parseSenses(v.senses),
  };
}

function parseExtractionMethod(
  value: string | undefined,
): 'API' | 'RSS' | 'HTML' | 'PDF' | 'MANUAL' {
  const v = value?.toUpperCase();
  if (
    v === 'API' ||
    v === 'RSS' ||
    v === 'HTML' ||
    v === 'PDF' ||
    v === 'MANUAL'
  )
    return v;
  return 'MANUAL';
}

function parseContentMode(
  value: string | undefined,
): 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED' {
  const v = value?.toUpperCase();
  if (v === 'QUOTED' || v === 'SUMMARIZED' || v === 'PARAPHRASED') return v;
  return 'SUMMARIZED';
}

function toJsonInput(
  value: Prisma.JsonValue | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Read back out of a Prisma JSON column, so it is already valid JSON input;
  // only `null`, which Prisma models separately as `JsonNull`, is excluded above.
  return value as Prisma.InputJsonValue;
}

/**
 * Similarity band boundaries for matching an incoming definition against the
 * entry's existing senses (pg_trgm `similarity()` over `definition_text`).
 *
 * - `>= DEFAULT_ATTACH_THRESHOLD`: same meaning, attach as another attestation.
 * - `[AMBIGUOUS_THRESHOLD, DEFAULT_ATTACH_THRESHOLD)`: too close to call, open a
 *   new sense and flag it `needsLabel` so an editor disambiguates (SPEC FR-107).
 * - `< AMBIGUOUS_THRESHOLD`: a genuinely different meaning, open a new sense.
 */
const DEFAULT_ATTACH_THRESHOLD = 0.6;
const AMBIGUOUS_THRESHOLD = 0.35;

export type ApplyProposedChangeInput = {
  actorUserId: string;
  ingestItemId: string;
  /** Similarity threshold (0..1) above which an incoming definition attaches to an existing sense. */
  attachThreshold?: number;
  /**
   * When true (default) the ingest item is moved to `APPLIED` with a diff.
   * Callers that need to hold the item back (for example the auto-publish
   * `needs_label` conflict case) pass `false` and call `finalizeIngestItem`.
   */
  markApplied?: boolean;
};

export type ApplyProposedChangeResult = {
  entryId: string;
  appliedSenseIds: string[];
  createdSenseIds: string[];
  attachedSenseIds: string[];
  needsLabelSenseIds: string[];
  citationId: string;
  /** True when the entry was created by this call. */
  entryCreated: boolean;
  /** Number of PUBLISHED senses the entry already had before this call. */
  existingPublishedSenseCount: number;
};

type LoadedIngestItem = {
  id: string;
  stage: string;
  licenseGate: 'PASS' | 'WARN' | 'FAIL';
  proposedChange: Prisma.JsonValue | null;
  sourceDocumentId: string;
  ingestRun: {
    sourceId: string;
    source: {
      id: string;
      name: string;
      accessMethod: string;
      licenseNotes: string | null;
      licensePublicStatement: string | null;
      attributionRequirements: string;
      defaultContentMode: string;
    };
  };
  sourceDocument: {
    url: string;
    canonicalUrl: string | null;
    title: string | null;
    fetchedAt: Date;
    doNotUse: boolean;
    doNotUseReason: string | null;
  };
};

async function loadIngestItem(
  db: DbClientLike,
  ingestItemId: string,
): Promise<LoadedIngestItem> {
  const item = await db.ingestItem.findFirst({
    where: { id: ingestItemId },
    select: {
      id: true,
      stage: true,
      licenseGate: true,
      proposedChange: true,
      sourceDocumentId: true,
      ingestRun: {
        select: {
          sourceId: true,
          source: {
            select: {
              id: true,
              name: true,
              accessMethod: true,
              licenseNotes: true,
              licensePublicStatement: true,
              attributionRequirements: true,
              defaultContentMode: true,
            },
          },
        },
      },
      sourceDocument: {
        select: {
          url: true,
          canonicalUrl: true,
          title: true,
          fetchedAt: true,
          doNotUse: true,
          doNotUseReason: true,
        },
      },
    },
  });

  if (!item) throw new Error(`Ingest item not found: ${ingestItemId}`);
  return item;
}

async function isEntrySlugTaken(
  db: DbClientLike,
  entryType: 'TERM' | 'ACRONYM',
  candidate: string,
): Promise<boolean> {
  const [entry, history] = await Promise.all([
    db.entry.findFirst({
      where: { entryType, primarySlug: candidate, deletedAt: null },
      select: { id: true },
    }),
    db.entrySlugHistory.findFirst({
      where: { entryType, slug: candidate },
      select: { id: true },
    }),
  ]);
  return Boolean(entry || history);
}

async function ensureUniqueEntrySlug(
  db: DbClientLike,
  entryType: 'TERM' | 'ACRONYM',
  desiredSlug: string,
): Promise<string> {
  const base = desiredSlug || 'entry';
  let candidate = base;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!(await isEntrySlugTaken(db, entryType, candidate))) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }
  throw new Error('Unable to find a unique entry slug (too many collisions)');
}

/**
 * Sense slugs are unique per entry among non-deleted senses (partial unique
 * index `senses_entry_id_slug_active_key`). `reserved` covers slugs minted
 * earlier in this same call that are not committed yet.
 */
async function ensureUniqueSenseSlug(
  db: DbClientLike,
  entryId: string,
  desiredSlug: string,
  reserved: Set<string>,
): Promise<string> {
  const base = desiredSlug || 'sense';
  let candidate = base;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!reserved.has(candidate)) {
      const taken = await db.sense.findFirst({
        where: { entryId, slug: candidate, deletedAt: null },
        select: { id: true },
      });
      if (!taken) {
        reserved.add(candidate);
        return candidate;
      }
    }
    candidate = `${base}-${attempt + 2}`;
  }
  throw new Error('Unable to find a unique sense slug (too many collisions)');
}

type SimilarityRow = { id: string; sim: number };

async function scoreExistingSenses(
  db: DbClientLike,
  entryId: string,
  definitionText: string,
): Promise<SimilarityRow[]> {
  if (!definitionText.trim()) return [];

  const rows = await db.$queryRaw<
    Array<{ id: string; sim: number | null }>
  >(Prisma.sql`
    SELECT s.id::text AS id, similarity(s.definition_text, ${definitionText}) AS sim
    FROM senses s
    WHERE s.entry_id = ${entryId}::uuid
      AND s.deleted_at IS NULL
      AND s.definition_text IS NOT NULL
      AND s.definition_text <> ''
    ORDER BY sim DESC NULLS LAST, s.sense_order ASC
  `);

  return rows.map((r) => ({
    id: r.id,
    sim: typeof r.sim === 'number' ? r.sim : 0,
  }));
}

/**
 * True when any of `definitionTexts` lands in the ambiguous similarity band
 * against one of the entry's existing senses: close enough to look like a
 * duplicate, not close enough to attach. Used by the ingest validation stage to
 * flag `stageOutputs.validated.conflict` for reviewers. Lives here so
 * `apps/worker` does not need its own `@prisma/client` dependency for raw SQL.
 */
export async function hasAmbiguousSenseConflict(
  db: DbClientLike,
  input: {
    entryId: string;
    definitionTexts: string[];
    attachThreshold?: number;
  },
): Promise<boolean> {
  const attachThreshold = input.attachThreshold ?? DEFAULT_ATTACH_THRESHOLD;

  for (const definitionText of input.definitionTexts) {
    const scored = await scoreExistingSenses(db, input.entryId, definitionText);
    const best = scored[0]?.sim ?? 0;
    if (best >= AMBIGUOUS_THRESHOLD && best < attachThreshold) return true;
  }

  return false;
}

/** Resolves a title to an entry id via normalized title, then via entry variants. */
async function resolveEntryIdByTitle(
  db: DbClientLike,
  input: { normalizedTitle: string; entryType?: 'TERM' | 'ACRONYM' },
): Promise<string | null> {
  const entryFilter: Prisma.EntryWhereInput = { deletedAt: null };
  if (input.entryType) entryFilter.entryType = input.entryType;

  const entry = await db.entry.findFirst({
    where: { ...entryFilter, normalizedTitle: input.normalizedTitle },
    select: { id: true },
  });
  if (entry) return entry.id;

  const variant = await db.entryVariant.findFirst({
    where: {
      normalizedVariant: input.normalizedTitle,
      entry: entryFilter,
    },
    select: { entryId: true },
  });
  return variant?.entryId ?? null;
}

/**
 * Shared apply path for ingest proposals (worker auto-apply and admin approve).
 * Creates or matches the entry, attaches each proposed definition to an
 * existing sense (by trigram similarity of definition text) or opens a new
 * sense flagged `needsLabel`, writes citations, sense_definitions, and
 * field_provenance idempotently, and returns what was touched.
 */
export async function applyProposedChange(
  db: DbClientLike,
  input: ApplyProposedChangeInput,
): Promise<ApplyProposedChangeResult> {
  const attachThreshold = input.attachThreshold ?? DEFAULT_ATTACH_THRESHOLD;
  const item = await loadIngestItem(db, input.ingestItemId);

  if (item.stage === 'APPLIED' || item.stage === 'REJECTED') {
    throw new Error(`Item not eligible for apply (stage=${item.stage})`);
  }
  if (item.licenseGate === 'FAIL') {
    throw new Error('Item not eligible for apply (licenseGate=FAIL)');
  }
  if (item.sourceDocument.doNotUse) {
    const reason = item.sourceDocument.doNotUseReason?.trim()
      ? `: ${item.sourceDocument.doNotUseReason.trim()}`
      : '';
    throw new Error(
      `Item not eligible for apply (SourceDocument do-not-use${reason})`,
    );
  }

  const proposed = parseProposedChange(item.proposedChange);
  if (!proposed.displayTitle.trim())
    throw new Error('proposedChange.displayTitle is required');

  const proposedSenses = proposed.senses.filter((s) =>
    Boolean(s.definitionMd?.trim()),
  );
  if (proposedSenses.length === 0) {
    throw new Error('proposedChange requires at least one sense definition');
  }

  const firstProposedSense = proposedSenses[0];
  if (!firstProposedSense)
    throw new Error('proposedChange requires at least one sense definition');

  const summaryMd =
    (proposed.summaryMd?.trim() ?? '') ||
    firstProposedSense.definitionMd.trim();
  const entryType = proposed.entryType;
  const normalizedTitle = normalizeTitle(proposed.displayTitle);

  const matchedEntryId = await resolveEntryIdByTitle(db, {
    normalizedTitle,
    entryType,
  });

  let entryId: string;
  let entryCreated = false;

  if (matchedEntryId) {
    entryId = matchedEntryId;
    const existing = await db.entry.findFirst({
      where: { id: entryId },
      select: { id: true, summaryMd: true },
    });
    if (!existing?.summaryMd?.trim() && summaryMd.trim()) {
      await db.entry.update({
        where: { id: entryId },
        data: {
          summaryMd: summaryMd.trim(),
          summaryText: markdownToText(summaryMd.trim()) || null,
          updatedByUserId: input.actorUserId,
        },
        select: { id: true },
      });
    }
  } else {
    const desiredSlug =
      proposed.kind === 'CREATE_ENTRY' && proposed.primarySlug
        ? slugify(proposed.primarySlug)
        : slugify(proposed.displayTitle);
    const uniqueSlug = await ensureUniqueEntrySlug(db, entryType, desiredSlug);

    const entry = await db.entry.create({
      data: {
        entryType,
        displayTitle: proposed.displayTitle.trim(),
        normalizedTitle,
        primarySlug: uniqueSlug,
        status: 'DRAFT',
        summaryMd: summaryMd.trim() || null,
        summaryText: summaryMd.trim()
          ? markdownToText(summaryMd.trim()) || null
          : null,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
        entryType: true,
        displayTitle: true,
        primarySlug: true,
        status: true,
      },
    });

    await db.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_CREATE',
        entityType: 'ENTRY',
        entityId: entry.id,
        after: toJsonSafe(entry),
      },
    });

    entryId = entry.id;
    entryCreated = true;
  }

  const sensesBefore = await db.sense.findMany({
    where: { entryId, deletedAt: null },
    select: { id: true, senseOrder: true, slug: true, status: true },
    orderBy: [{ senseOrder: 'asc' }],
  });
  const existingSenseCount = sensesBefore.length;
  const existingPublishedSenseCount = sensesBefore.filter(
    (s) => s.status === 'PUBLISHED',
  ).length;

  const reservedSlugs = new Set<string>();
  for (const s of sensesBefore) {
    if (s.slug) reservedSlugs.add(s.slug);
  }
  let nextSenseOrder =
    sensesBefore.reduce((max, s) => Math.max(max, s.senseOrder), -1) + 1;

  const variantsToCreate = proposed.variants.flatMap((variant) => {
    const variantText = variant.variantText.trim();
    const normalizedVariant = normalizeTitle(variantText);
    if (!variantText || normalizedVariant === normalizedTitle) return [];

    return [
      {
        entryId,
        variantText,
        normalizedVariant,
        variantType: variant.variantType,
      },
    ];
  });

  if (variantsToCreate.length) {
    await db.entryVariant.createMany({
      data: variantsToCreate,
      skipDuplicates: true,
    });
  }

  const source = item.ingestRun.source;
  const citationUrl =
    item.sourceDocument.canonicalUrl ?? item.sourceDocument.url;
  const citationText = item.sourceDocument.title?.trim()
    ? item.sourceDocument.title.trim()
    : source.name;
  const licenseNote = source.licensePublicStatement ?? source.licenseNotes;
  const attributionText = source.attributionRequirements;

  const citation = await db.citation.upsert({
    where: {
      sourceId_sourceDocumentId_url: {
        sourceId: source.id,
        sourceDocumentId: item.sourceDocumentId,
        url: citationUrl,
      },
    },
    create: {
      sourceId: source.id,
      sourceDocumentId: item.sourceDocumentId,
      url: citationUrl,
      citationText,
      licenseNote,
      attributionText,
      accessedAt: item.sourceDocument.fetchedAt,
    },
    update: {
      citationText,
      licenseNote,
      attributionText,
      accessedAt: item.sourceDocument.fetchedAt,
    },
    select: { id: true },
  });

  const defaultExtractionMethod = parseExtractionMethod(source.accessMethod);
  const appliedSenseIds: string[] = [];
  const createdSenseIds: string[] = [];
  const attachedSenseIds: string[] = [];
  const needsLabelSenseIds: string[] = [];

  /** Senses already consumed by an earlier proposed definition in this call. */
  const consumedSenseIds = new Set<string>();

  for (const proposedSense of proposedSenses) {
    const definitionMd = proposedSense.definitionMd.trim();
    const definitionText = markdownToText(definitionMd);
    const contentMode = parseContentMode(proposedSense.contentMode);
    const extractionMethod = parseExtractionMethod(
      proposedSense.extractionMethod ?? defaultExtractionMethod,
    );
    const extractorVersion = proposedSense.extractorVersion?.trim()
      ? proposedSense.extractorVersion.trim()
      : 'synac-worker';
    const senseLabel = proposedSense.senseLabel?.trim()
      ? proposedSense.senseLabel.trim()
      : null;
    const expandedForm = proposedSense.expandedForm?.trim()
      ? proposedSense.expandedForm.trim()
      : null;

    const scored = (
      await scoreExistingSenses(db, entryId, definitionText)
    ).filter((row) => !consumedSenseIds.has(row.id));
    const best = scored[0] ?? null;
    const bestScore = best?.sim ?? 0;

    let senseId: string;
    let similarityToPrimary: number | null = null;
    let isAttachment = false;

    if (best && bestScore >= attachThreshold) {
      // Same meaning, another source's wording: attach as an extra attestation.
      senseId = best.id;
      similarityToPrimary = bestScore;
      isAttachment = true;
      attachedSenseIds.push(senseId);
    } else {
      const ambiguous =
        Boolean(best) &&
        bestScore >= AMBIGUOUS_THRESHOLD &&
        bestScore < attachThreshold;
      const needsLabel = ambiguous || (!senseLabel && existingSenseCount >= 1);

      const slugBase = slugify(
        senseLabel ?? expandedForm ?? `sense-${nextSenseOrder + 1}`,
      );
      const slug = await ensureUniqueSenseSlug(
        db,
        entryId,
        slugBase,
        reservedSlugs,
      );
      const senseOrder = nextSenseOrder;
      nextSenseOrder += 1;

      const created = await db.sense.create({
        data: {
          entryId,
          senseOrder,
          senseLabel,
          expandedForm,
          slug,
          needsLabel,
          definitionMd: definitionMd || null,
          definitionText: definitionText || null,
          isEditorial: false,
          editorialRationale: null,
          isPreferred: senseOrder === 0,
          status: 'DRAFT',
        },
        select: {
          id: true,
          entryId: true,
          senseOrder: true,
          slug: true,
          needsLabel: true,
          status: true,
        },
      });

      await db.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'SENSE_CREATE',
          entityType: 'SENSE',
          entityId: created.id,
          after: toJsonSafe(created),
        },
      });

      senseId = created.id;
      createdSenseIds.push(senseId);
      if (needsLabel) needsLabelSenseIds.push(senseId);
    }

    consumedSenseIds.add(senseId);
    appliedSenseIds.push(senseId);

    // `isPrimary` marks the attestation rendered as the sense's definition.
    // Only claim it when the sense has none yet.
    const existingPrimary = await db.senseDefinition.findFirst({
      where: { senseId, isPrimary: true },
      select: { id: true, citationId: true },
    });
    const isPrimary =
      !existingPrimary || existingPrimary.citationId === citation.id;

    await db.senseDefinition.upsert({
      where: { senseId_citationId: { senseId, citationId: citation.id } },
      create: {
        senseId,
        citationId: citation.id,
        definitionMd,
        definitionText,
        contentMode,
        isPrimary,
        similarityToPrimary: isPrimary ? null : similarityToPrimary,
        sourceLocator: toJsonInput(proposedSense.sourceLocator),
        extractorVersion,
        extractedAt: item.sourceDocument.fetchedAt,
      },
      update: {
        definitionMd,
        definitionText,
        contentMode,
        isPrimary,
        similarityToPrimary: isPrimary ? null : similarityToPrimary,
        sourceLocator: toJsonInput(proposedSense.sourceLocator),
        extractorVersion,
        extractedAt: item.sourceDocument.fetchedAt,
      },
      select: { id: true },
    });

    // Attaching to an existing sense must never overwrite its rendered
    // definition, because that sense already has an owner. Only fill in a blank.
    if (isAttachment) {
      const target = await db.sense.findFirst({
        where: { id: senseId },
        select: { definitionMd: true },
      });
      if (!target?.definitionMd?.trim() && definitionMd) {
        await db.sense.update({
          where: { id: senseId },
          data: { definitionMd, definitionText: definitionText || null },
          select: { id: true },
        });
      }
    }

    await db.fieldProvenance.createMany({
      data: [
        {
          entityType: 'SENSE',
          entityId: senseId,
          fieldName: 'definitionMd',
          citationId: citation.id,
          contentMode,
          extractionMethod,
          extractorVersion,
          extractedAt: item.sourceDocument.fetchedAt,
          sourceLocator: toJsonInput(proposedSense.sourceLocator),
        },
      ],
      skipDuplicates: true,
    });
  }

  if (summaryMd.trim()) {
    await db.fieldProvenance.createMany({
      data: [
        {
          entityType: 'ENTRY',
          entityId: entryId,
          fieldName: 'summaryMd',
          citationId: citation.id,
          contentMode: parseContentMode(firstProposedSense.contentMode),
          extractionMethod: parseExtractionMethod(
            firstProposedSense.extractionMethod ?? defaultExtractionMethod,
          ),
          extractorVersion: firstProposedSense.extractorVersion?.trim()
            ? firstProposedSense.extractorVersion.trim()
            : 'synac-worker',
          extractedAt: item.sourceDocument.fetchedAt,
          sourceLocator: toJsonInput(firstProposedSense.sourceLocator),
        },
      ],
      skipDuplicates: true,
    });
  }

  for (const tagSlug of proposed.tags) {
    const tag = await db.tag.findFirst({
      where: { slug: tagSlug, deletedAt: null },
      select: { id: true },
    });
    if (!tag) continue;
    await db.entryTag.upsert({
      where: { entryId_tagId: { entryId, tagId: tag.id } },
      create: { entryId, tagId: tag.id, assignedBy: 'INGEST' },
      update: {},
      select: { entryId: true },
    });
  }

  // Relationship targets that do not exist yet are skipped, not created.
  for (const rel of proposed.relationships) {
    const targetNormalized = normalizeTitle(rel.targetTitle);
    if (!targetNormalized) continue;

    const toEntryId = await resolveEntryIdByTitle(db, {
      normalizedTitle: targetNormalized,
    });
    if (!toEntryId || toEntryId === entryId) continue;

    const existingRel = await db.entryRelationship.findFirst({
      where: {
        fromEntryId: entryId,
        toEntryId,
        relationshipType: rel.type,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingRel) continue;

    await db.entryRelationship.create({
      data: {
        fromEntryId: entryId,
        toEntryId,
        relationshipType: rel.type,
        note: rel.note ?? null,
        sourceId: source.id,
        createdByUserId: input.actorUserId,
      },
      select: { id: true },
    });
  }

  const result: ApplyProposedChangeResult = {
    entryId,
    appliedSenseIds,
    createdSenseIds,
    attachedSenseIds,
    needsLabelSenseIds,
    citationId: citation.id,
    entryCreated,
    existingPublishedSenseCount,
  };

  if (input.markApplied !== false) {
    await finalizeIngestItem(db, {
      actorUserId: input.actorUserId,
      ingestItemId: item.id,
      stage: 'APPLIED',
      diff: {
        appliedEntryId: entryId,
        appliedSenseIds,
        createdSenseIds,
        attachedSenseIds,
        needsLabelSenseIds,
      },
    });
  }

  return result;
}

/** Audit payload written to `IngestItem.diff` and mirrored into the audit event. */
export type IngestItemDiff = {
  appliedEntryId: string;
  appliedSenseIds: string[];
  createdSenseIds: string[];
  attachedSenseIds: string[];
  needsLabelSenseIds: string[];
  autoApplied?: boolean;
  autoPublished?: boolean;
  publishedSenseCount?: number;
  reason?: string;
  reasons?: string[];
};

export type FinalizeIngestItemInput = {
  actorUserId: string;
  ingestItemId: string;
  stage: 'APPLIED' | 'REVIEWED' | 'REJECTED';
  diff: IngestItemDiff;
  auditAction?: string;
};

/**
 * Moves an ingest item to its terminal stage and records the audit trail.
 * Split out of `applyProposedChange` so callers can hold an item back (for
 * example at `REVIEWED` when a new sense needs an editor label) while still
 * sharing the data-apply path.
 */
export async function finalizeIngestItem(
  db: DbClientLike,
  input: FinalizeIngestItemInput,
): Promise<void> {
  const diff = toJsonSafe(input.diff);

  await db.ingestItem.update({
    where: { id: input.ingestItemId },
    data: { stage: input.stage, diff, error: null },
    select: { id: true },
  });

  await db.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.auditAction ?? 'INGEST_ITEM_AUTO_APPLY',
      entityType: 'INGEST_ITEM',
      entityId: input.ingestItemId,
      after: diff,
    },
  });
}

/**
 * Publishes an entry produced by the ingest pipeline: every sense that has a
 * definition and at least one citation (or an editorial rationale) goes
 * PUBLISHED, missing sense slugs are backfilled, and auto-tags are synced.
 */
export async function publishEntryFromIngest(
  db: DbClientLike,
  input: { actorUserId: string; entryId: string },
): Promise<{ publishedSenseCount: number }> {
  const now = new Date();

  const entry = await db.entry.findFirst({
    where: { id: input.entryId, deletedAt: null },
    select: {
      id: true,
      entryType: true,
      status: true,
      summaryMd: true,
      summaryText: true,
      editorialNotes: true,
      publishedAt: true,
    },
  });
  if (!entry) throw new Error('Entry not found');

  if (!entry.summaryMd?.trim()) {
    throw new Error('Publishing requires a summary');
  }

  const senses = await db.sense.findMany({
    where: { entryId: entry.id, deletedAt: null },
    select: {
      id: true,
      senseOrder: true,
      slug: true,
      senseLabel: true,
      expandedForm: true,
      definitionMd: true,
      definitionText: true,
      isEditorial: true,
      editorialRationale: true,
    },
    orderBy: [{ senseOrder: 'asc' }],
  });

  const publishable = senses.filter((s) =>
    Boolean(s.definitionMd?.trim() || s.definitionText),
  );
  if (publishable.length === 0) {
    throw new Error('Publishing requires at least one sense with a definition');
  }

  const provenanceCounts = await db.fieldProvenance.groupBy({
    by: ['entityId'],
    where: {
      entityType: 'SENSE',
      entityId: { in: publishable.map((s) => s.id) },
    },
    _count: { _all: true },
  });
  const bySenseId = new Map(
    provenanceCounts.map((r) => [r.entityId, r._count._all]),
  );

  const publishableWithCitations = publishable.filter((s) => {
    if (s.isEditorial && s.editorialRationale?.trim()) return true;
    return (bySenseId.get(s.id) ?? 0) > 0;
  });

  if (publishableWithCitations.length === 0) {
    throw new Error(
      'Publishing requires citations per sense (or Editorial rationale)',
    );
  }

  // Backfill sense slugs so published senses are addressable.
  const reservedSlugs = new Set<string>();
  for (const s of senses) {
    if (s.slug) reservedSlugs.add(s.slug);
  }
  for (const s of senses) {
    if (s.slug) continue;
    const base = slugify(
      s.senseLabel ?? s.expandedForm ?? `sense-${s.senseOrder + 1}`,
    );
    const slug = await ensureUniqueSenseSlug(db, entry.id, base, reservedSlugs);
    await db.sense.update({
      where: { id: s.id },
      data: { slug },
      select: { id: true },
    });
  }

  const after = await db.entry.update({
    where: { id: entry.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: entry.status === 'PUBLISHED' ? entry.publishedAt : now,
      updatedByUserId: input.actorUserId,
    },
    select: {
      id: true,
      entryType: true,
      status: true,
      summaryMd: true,
      summaryText: true,
      editorialNotes: true,
      publishedAt: true,
    },
  });

  await db.sense.updateMany({
    where: { id: { in: publishableWithCitations.map((s) => s.id) } },
    data: { status: 'PUBLISHED', publishedAt: now },
  });

  await syncAutoTagsForPublishedEntry(db, { entryId: entry.id });

  await db.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'ENTRY_PUBLISH',
      entityType: 'ENTRY',
      entityId: entry.id,
      before: toJsonSafe(entry),
      after: toJsonSafe(after),
    },
  });

  return { publishedSenseCount: publishableWithCitations.length };
}
