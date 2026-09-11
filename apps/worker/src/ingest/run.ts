import type { Prisma } from '@synac/db';
import { getPrismaClient } from '@synac/db';

import { logger } from '../logger.js';
import type {
  AdapterContext,
  AdapterSource,
  IngestAdapter,
} from './adapter.js';
import { persistParsedEntries } from './adapter.js';
import { normalizeMaxItems } from './textHeuristics.js';
import { mitreAttackCtiAdapters } from './mitreAttackCti.js';
import { niccsGlossaryAdapter } from './niccsGlossary.js';
import { nistGlossaryAdapter } from './nistGlossary.js';
import { owaspVulnerabilitiesAdapter } from './owaspVulnerabilities.js';
import { rfc4949GlossaryAdapter } from './rfc4949Glossary.js';

const ADAPTERS: IngestAdapter[] = [
  nistGlossaryAdapter,
  niccsGlossaryAdapter,
  owaspVulnerabilitiesAdapter,
  rfc4949GlossaryAdapter,
  ...mitreAttackCtiAdapters,
];

/** Primary registry: `Source.sourceSlug` -> adapter. */
export const ADAPTER_REGISTRY: ReadonlyMap<string, IngestAdapter> = new Map(
  ADAPTERS.map((adapter) => [adapter.slug, adapter]),
);

/**
 * Fallback for sources whose slug predates the registry. Matched against the
 * `baseUrl` hostname; the registry is always consulted first.
 */
const HOSTNAME_FALLBACKS: ReadonlyArray<{
  matches: (host: string) => boolean;
  adapter: IngestAdapter;
}> = [
  { matches: (h) => h === 'csrc.nist.gov', adapter: nistGlossaryAdapter },
  { matches: (h) => h === 'niccs.cisa.gov', adapter: niccsGlossaryAdapter },
  {
    matches: (h) => h === 'owasp.org' || h.endsWith('.owasp.org'),
    adapter: owaspVulnerabilitiesAdapter,
  },
  {
    matches: (h) => h === 'rfc-editor.org' || h === 'www.rfc-editor.org',
    adapter: rfc4949GlossaryAdapter,
  },
  {
    matches: (h) => h === 'raw.githubusercontent.com',
    adapter: mitreAttackCtiAdapters[0] ?? nistGlossaryAdapter,
  },
];

export function resolveAdapter(input: {
  sourceSlug: string;
  baseUrl: string;
}): IngestAdapter | null {
  const bySlug = ADAPTER_REGISTRY.get(input.sourceSlug.trim().toLowerCase());
  if (bySlug) return bySlug;

  let host: string;
  try {
    host = new URL(input.baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  for (const fallback of HOSTNAME_FALLBACKS) {
    if (fallback.matches(host)) return fallback.adapter;
  }

  return null;
}

type IngestRunConfig = { maxItems: number; forceReprocess: boolean };

/** Narrows `IngestRun.configSnapshot` once, so the run body never sees raw JSON. */
function parseIngestRunConfig(
  configSnapshot: Prisma.JsonValue,
): IngestRunConfig {
  const raw =
    configSnapshot &&
    typeof configSnapshot === 'object' &&
    !Array.isArray(configSnapshot)
      ? configSnapshot
      : {};

  const force = raw.forceReprocess;
  const forceText = typeof force === 'string' ? force.trim().toLowerCase() : '';

  return {
    maxItems: normalizeMaxItems(Number(raw.maxItems)),
    forceReprocess:
      typeof force === 'boolean'
        ? force
        : forceText === 'true' || forceText === '1',
  };
}

export async function runIngestRun(ingestRunId: string): Promise<void> {
  const prisma = getPrismaClient();
  const startMs = Date.now();

  const run = await prisma.ingestRun.findFirst({
    where: { id: ingestRunId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      configSnapshot: true,
      source: {
        select: {
          id: true,
          name: true,
          sourceSlug: true,
          baseUrl: true,
          licenseType: true,
          lastVerifiedAt: true,
          accessMethod: true,
          defaultContentMode: true,
          robotsPolicy: true,
          rateLimitPolicy: true,
        },
      },
    },
  });

  if (!run) throw new Error(`Ingest run not found: ${ingestRunId}`);
  if (run.status !== 'RUNNING') return;

  const { maxItems, forceReprocess } = parseIngestRunConfig(run.configSnapshot);

  const source: AdapterSource = {
    id: run.source.id,
    name: run.source.name,
    sourceSlug: run.source.sourceSlug,
    baseUrl: run.source.baseUrl,
    licenseType: run.source.licenseType,
    lastVerifiedAt: run.source.lastVerifiedAt,
    accessMethod: run.source.accessMethod,
    defaultContentMode: run.source.defaultContentMode,
    robotsPolicy: run.source.robotsPolicy,
    rateLimitPolicy: run.source.rateLimitPolicy,
  };

  try {
    const adapter = resolveAdapter({
      sourceSlug: source.sourceSlug,
      baseUrl: source.baseUrl,
    });
    if (!adapter) {
      throw new Error(
        `No ingest adapter configured for source: sourceSlug=${source.sourceSlug} baseUrl=${source.baseUrl}`,
      );
    }

    logger.info('ingest.run.start', {
      ingestRunId: run.id,
      sourceId: source.id,
      sourceSlug: source.sourceSlug,
      adapter: adapter.slug,
      adapterVersion: adapter.version,
      baseUrl: source.baseUrl,
      maxItems,
      forceReprocess,
    });

    const ctx: AdapterContext = {
      prisma,
      ingestRunId: run.id,
      source,
      maxItems,
      forceReprocess,
    };

    const parsed = await adapter.parse(ctx);
    const persisted = await persistParsedEntries(prisma, ctx, parsed.entries);

    const itemsFailed = parsed.failed + persisted.itemsFailed;
    const itemsSkipped = parsed.skipped;
    // Items already ingested under the same itemKey are the normal steady
    // state, so they do NOT downgrade the run; anomalies do.
    const status = itemsFailed > 0 || itemsSkipped > 0 ? 'PARTIAL' : 'SUCCESS';

    const stats = {
      itemsCreated: persisted.itemsCreated,
      itemsDeduped: persisted.itemsDeduped,
      itemsFailed,
      itemsSkipped,
      adapter: adapter.slug,
      adapterVersion: adapter.version,
    };

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), stats },
    });

    logger.info('ingest.run.finished', {
      ingestRunId: run.id,
      sourceId: source.id,
      status,
      ...stats,
      durationMs: Date.now() - startMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        stats: { error: message },
      },
    });

    logger.error('ingest.run.failed', {
      ingestRunId: run.id,
      sourceId: source.id,
      durationMs: Date.now() - startMs,
      error: message,
    });
    throw err;
  }
}
