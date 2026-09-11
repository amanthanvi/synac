import type { Prisma, PrismaClient } from '@synac/db';
import { hasAmbiguousSenseConflict } from '@synac/db';

import { logger } from '../logger.js';
import { USER_AGENT } from '../version.js';
import { safeFetch } from '../net/safeFetch.js';
import { evaluateLicenseGate } from './licenseGate.js';
import { isUrlAllowedByRobots } from './robots.js';
import { parseRateLimitPolicy, waitForRateLimitSlot } from './rateLimit.js';

/** A JSON object under construction. Prisma's own `InputJsonObject` is readonly. */
export type JsonObject = Record<string, Prisma.InputJsonValue>;

export type ContentMode = 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
export type EntryType = 'TERM' | 'ACRONYM';
export type VariantType = 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' | 'MISSPELLING';
export type RelationshipType =
  | 'RELATED'
  | 'BROADER_THAN'
  | 'NARROWER_THAN'
  | 'OFTEN_CONFUSED_WITH'
  | 'SEE_ALSO';

/**
 * `ExtractionMethod` has only API|RSS|HTML|PDF|MANUAL, so the mapping from how
 * an adapter actually obtains its bytes is:
 *
 * - `'HTML'`, and only this, for scraping rendered HTML pages
 *   (NIST CSRC glossary, OWASP community pages).
 * - `'API'` for every machine-readable fetch: JSON/STIX bundles, CSV exports,
 *   and plain-text documents. RFC 4949 is a plain-text RFC, not HTML, so it is
 *   `'API'`, not `'HTML'`: the enum has no `OTHER` member to reach for.
 * - `'RSS'` / `'PDF'` for those formats specifically.
 * - `'MANUAL'` only for human-entered content, never for an adapter.
 */
export type ExtractionMethod = 'API' | 'RSS' | 'HTML' | 'PDF' | 'MANUAL';

/** The slice of `Source` an adapter needs. Selected once by `run.ts`. */
export type AdapterSource = {
  id: string;
  name: string;
  sourceSlug: string;
  baseUrl: string;
  licenseType: string;
  lastVerifiedAt: Date | null;
  accessMethod: string;
  defaultContentMode: ContentMode;
  robotsPolicy: 'RESPECT' | 'EXPLICIT_PERMISSION';
  rateLimitPolicy: Prisma.JsonValue;
};

export type AdapterContext = {
  prisma: PrismaClient;
  ingestRunId: string;
  source: AdapterSource;
  maxItems: number;
  forceReprocess: boolean;
};

export type ParsedSense = {
  senseLabel?: string | null;
  expandedForm?: string | null;
  definitionMd: string;
  sourceLocator?: Prisma.InputJsonValue;
};

export type ParsedRelationship = {
  type: RelationshipType;
  targetTitle: string;
  note?: string;
};

/** One extracted glossary item, ready for the shared stage writes. */
export type ParsedEntry = {
  itemKey: string;
  sourceDocumentId: string;
  fetchedAt: Date;
  entryType: EntryType;
  displayTitle: string;
  normalizedTitle: string;
  summaryMd: string;
  senses: ParsedSense[];
  variants?: Array<{ variantText: string; variantType: VariantType }>;
  tags?: string[];
  relationships?: ParsedRelationship[];
  contentMode: ContentMode;
  extractionMethod: ExtractionMethod;
  extractorVersion: string;
  confidenceScore: number;
  /** Raw payload recorded as `stageOutputs.extracted`. */
  extracted: JsonObject;
};

export type ParseOutcome = {
  entries: ParsedEntry[];
  /** Items dropped for an anomalous reason (robots disallow, non-200, unparsable). */
  skipped: number;
  failed: number;
};

export type IngestAdapter = {
  /** Matches `Source.sourceSlug`. */
  slug: string;
  /** The adapter's own `ADAPTER_VERSION`, e.g. `'nist@2'`. */
  version: string;
  parse(ctx: AdapterContext): Promise<ParseOutcome>;
};

export type PersistOutcome = {
  itemsCreated: number;
  /** Already present from an earlier run with the same `itemKey`. */
  itemsDeduped: number;
  itemsFailed: number;
};

export type PolicyFetchResult =
  | { ok: true; response: Awaited<ReturnType<typeof safeFetch>> }
  | { ok: false; reason: string };

/**
 * `safeFetch` wrapped in the two source-level policies: `robotsPolicy` and
 * `rateLimitPolicy`. Robots denials return `{ ok: false }` (the caller skips
 * and counts it); transport, TLS, SSRF and size failures still throw.
 */
export async function fetchWithPolicy(input: {
  url: string;
  source: AdapterSource;
  allowedHosts: string[];
  allowedContentTypePrefixes: string[];
  maxBytes: number;
  maxRedirects?: number;
  timeoutMs?: number;
}): Promise<PolicyFetchResult> {
  const target = new URL(input.url);
  const host = target.hostname.toLowerCase();

  if (input.source.robotsPolicy === 'RESPECT') {
    const verdict = await isUrlAllowedByRobots({
      url: input.url,
      userAgent: USER_AGENT,
    });
    if (!verdict.allowed) {
      logger.info('ingest.fetch.robots_disallowed', {
        url: input.url,
        sourceSlug: input.source.sourceSlug,
        reason: verdict.reason,
      });
      return {
        ok: false,
        reason: `robots.txt disallows ${input.url}: ${verdict.reason}`,
      };
    }
  }

  await waitForRateLimitSlot(
    host,
    parseRateLimitPolicy(input.source.rateLimitPolicy),
  );

  const response = await safeFetch({
    url: input.url,
    allowedHosts: input.allowedHosts,
    allowedContentTypePrefixes: input.allowedContentTypePrefixes,
    maxRedirects: input.maxRedirects ?? 3,
    timeoutMs: input.timeoutMs ?? 15_000,
    maxBytes: input.maxBytes,
    headers: { 'user-agent': USER_AGENT },
  });

  return { ok: true, response };
}

/**
 * Every adapter in this repo extracts verbatim source wording; none of them
 * summarize. When a source's policy asks for SUMMARIZED/PARAPHRASED we still
 * store the verbatim text (an attestation must stay faithful to the source) and
 * mark it `QUOTED`; `evaluateLicenseGate` then downgrades the item to WARN so a
 * human reviews it rather than the text being silently mislabelled.
 */
export function resolveContentMode(input: {
  defaultContentMode: ContentMode;
  verbatimOnly: boolean;
}): ContentMode {
  if (input.verbatimOnly) return 'QUOTED';
  return input.defaultContentMode;
}

/**
 * Idempotent `SourceDocument` write. `(sourceId, url, contentSha256)` is unique,
 * so an unchanged document resolves to the row that already exists, and the caller
 * must NOT treat that as "nothing to do": items are deduped per `itemKey` in
 * {@link persistParsedEntries} so a run truncated by `maxItems` can finish next
 * time.
 */
export async function upsertSourceDocument(
  prisma: PrismaClient,
  input: {
    sourceId: string;
    url: string;
    canonicalUrl: string | null;
    title: string | null;
    contentType: string;
    etag: string | null;
    lastModified: string | null;
    fetchedAt: Date;
    contentSha256: string;
    snapshotAllowed: boolean;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.sourceDocument.findFirst({
    where: {
      sourceId: input.sourceId,
      url: input.url,
      contentSha256: input.contentSha256,
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  try {
    const created = await prisma.sourceDocument.create({
      data: {
        sourceId: input.sourceId,
        url: input.url,
        canonicalUrl: input.canonicalUrl,
        title: input.title,
        contentType: input.contentType,
        etag: input.etag,
        lastModified: input.lastModified,
        fetchedAt: input.fetchedAt,
        contentSha256: input.contentSha256,
        snapshotAllowed: input.snapshotAllowed,
        snapshotStorageUri: null,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (err) {
    const raced = await prisma.sourceDocument.findFirst({
      where: {
        sourceId: input.sourceId,
        url: input.url,
        contentSha256: input.contentSha256,
      },
      select: { id: true },
    });
    if (!raced) throw err;
    return { id: raced.id, created: false };
  }
}

function buildProposedSenses(entry: ParsedEntry): Prisma.InputJsonValue {
  return entry.senses.map((sense) => {
    const out: JsonObject = {};
    if (sense.senseLabel) out.senseLabel = sense.senseLabel;
    if (sense.expandedForm) out.expandedForm = sense.expandedForm;
    out.definitionMd = sense.definitionMd;
    out.contentMode = entry.contentMode;
    out.extractionMethod = entry.extractionMethod;
    out.extractorVersion = entry.extractorVersion;
    if (sense.sourceLocator !== undefined) {
      out.sourceLocator = sense.sourceLocator;
    }
    return out;
  });
}

/**
 * The EXTRACTED -> NORMALIZED -> DEDUPED -> ENRICHED -> VALIDATED stage writes,
 * shared by every adapter. Items whose `itemKey` already has a non-FAILED ingest
 * item on the same source document are skipped, which is what lets a
 * `maxItems`-truncated first run be completed by the next run instead of the
 * whole run short-circuiting on an unchanged document hash.
 */
export async function persistParsedEntries(
  prisma: PrismaClient,
  ctx: AdapterContext,
  entries: ParsedEntry[],
): Promise<PersistOutcome> {
  let itemsCreated = 0;
  let itemsDeduped = 0;
  let itemsFailed = 0;

  const seenItemKeys = new Set<string>();

  for (const entry of entries) {
    if (itemsCreated >= ctx.maxItems) break;
    if (seenItemKeys.has(entry.itemKey)) continue;
    seenItemKeys.add(entry.itemKey);

    if (!ctx.forceReprocess) {
      const prior = await prisma.ingestItem.findFirst({
        where: {
          sourceDocumentId: entry.sourceDocumentId,
          itemKey: entry.itemKey,
          stage: { not: 'FAILED' },
        },
        select: { id: true },
      });
      if (prior) {
        itemsDeduped += 1;
        continue;
      }
    }

    const { licenseGate, licenseGateReason } = evaluateLicenseGate({
      licenseType: ctx.source.licenseType,
      lastVerifiedAt: ctx.source.lastVerifiedAt,
      contentMode: entry.contentMode,
      defaultContentMode: ctx.source.defaultContentMode,
    });

    const stageOutputs: JsonObject = {
      extracted: entry.extracted,
    };

    const ingestItem = await prisma.ingestItem.create({
      data: {
        ingestRunId: ctx.ingestRunId,
        sourceDocumentId: entry.sourceDocumentId,
        itemKey: entry.itemKey,
        stage: 'EXTRACTED',
        stageOutputs,
        confidenceScore: entry.confidenceScore,
        licenseGate,
        licenseGateReason,
      },
      select: { id: true },
    });

    const proposedSenses = buildProposedSenses(entry);
    const variants = entry.variants ?? [];
    const relationships = entry.relationships ?? [];
    const tags = entry.tags ?? [];

    const createEntryProposedChange: JsonObject = {
      kind: 'CREATE_ENTRY',
      entryType: entry.entryType,
      displayTitle: entry.displayTitle,
      summaryMd: entry.summaryMd,
    };
    if (variants.length) createEntryProposedChange.variants = variants;
    if (tags.length) createEntryProposedChange.tags = tags;
    if (relationships.length) {
      createEntryProposedChange.relationships = relationships;
    }
    createEntryProposedChange.senses = proposedSenses;

    stageOutputs.normalized = { proposedChange: createEntryProposedChange };
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'NORMALIZED',
        proposedChange: createEntryProposedChange,
        stageOutputs,
      },
      select: { id: true },
    });

    const existingEntry = await prisma.entry.findFirst({
      where: {
        entryType: entry.entryType,
        normalizedTitle: entry.normalizedTitle,
        deletedAt: null,
      },
      select: { id: true, displayTitle: true },
    });

    let proposedChange = createEntryProposedChange;
    if (existingEntry) {
      proposedChange = {
        ...createEntryProposedChange,
        kind: 'ADD_SENSES',
        entryId: existingEntry.id,
        displayTitle: existingEntry.displayTitle,
      };
    }

    stageOutputs.deduped = existingEntry
      ? {
          matchedEntryId: existingEntry.id,
          matchType: 'NORMALIZED_TITLE_EXACT',
          action: 'ADD_SENSES',
        }
      : { action: 'CREATE_ENTRY' };

    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: { stage: 'DEDUPED', proposedChange, stageOutputs },
      select: { id: true },
    });

    stageOutputs.enriched = {};
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: { stage: 'ENRICHED', stageOutputs },
      select: { id: true },
    });

    const definitions = entry.senses
      .map((s) => s.definitionMd.trim())
      .filter(Boolean);
    if (definitions.length === 0) {
      stageOutputs.validated = { ok: false, error: 'Missing sense definition' };
      await prisma.ingestItem.update({
        where: { id: ingestItem.id },
        data: {
          stage: 'FAILED',
          error: 'Missing sense definition',
          stageOutputs,
        },
        select: { id: true },
      });
      itemsFailed += 1;
      continue;
    }

    // Flag (do not block) the case where this definition sits in the ambiguous
    // similarity band against an existing sense. The apply path re-computes it
    // authoritatively; this is a reviewer hint.
    let conflict = false;
    if (existingEntry) {
      try {
        conflict = await hasAmbiguousSenseConflict(prisma, {
          entryId: existingEntry.id,
          definitionTexts: definitions,
        });
      } catch (err) {
        logger.debug('ingest.validate.conflict_check_failed', {
          ingestItemId: ingestItem.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    stageOutputs.validated = { ok: true, conflict };
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: { stage: 'VALIDATED', error: null, stageOutputs },
      select: { id: true },
    });

    itemsCreated += 1;
  }

  return { itemsCreated, itemsDeduped, itemsFailed };
}
