import type { Prisma, PrismaClient } from '@synac/db';

import { safeFetch } from '../net/safeFetch.js';
import { evaluateLicenseGate } from './licenseGate.js';

type StixAttackPattern = {
  type?: string;
  id?: string;
  name?: string;
  description?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  external_references?: Array<{ source_name?: string; external_id?: string }>;
};

type StixBundle = {
  objects?: unknown[];
};

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function normalizeTitle(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getAttackExternalId(pattern: StixAttackPattern): string | null {
  const refs = Array.isArray(pattern.external_references) ? pattern.external_references : [];
  for (const ref of refs) {
    const sourceName = ref?.source_name;
    const externalId = ref?.external_id;
    if (sourceName === 'mitre-attack' && typeof externalId === 'string' && externalId.trim()) {
      return externalId.trim();
    }
  }
  return null;
}

function getAttackPatterns(bundle: StixBundle): Array<{
  stixId: string;
  externalId: string;
  name: string;
  description: string;
}> {
  const objects = Array.isArray(bundle.objects) ? bundle.objects : [];
  const out: Array<{ stixId: string; externalId: string; name: string; description: string }> = [];

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const v = obj as StixAttackPattern;
    if (v.type !== 'attack-pattern') continue;
    if (v.revoked || v.x_mitre_deprecated) continue;

    const stixId = typeof v.id === 'string' ? v.id : '';
    const name = typeof v.name === 'string' ? v.name : '';
    const description = typeof v.description === 'string' ? v.description : '';
    const externalId = getAttackExternalId(v) ?? '';

    if (!stixId || !name || !description || !externalId) continue;
    out.push({ stixId, externalId, name, description });
  }

  return out;
}

function summarize(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return '';
  const firstParagraph = trimmed.split(/\n\s*\n/)[0]?.trim() ?? '';
  return firstParagraph || trimmed;
}

export async function ingestMitreAttackCti(
  prisma: PrismaClient,
  input: {
    ingestRunId: string;
    source: { id: string; baseUrl: string; licenseType: string; lastVerifiedAt: Date | null };
    maxItems: number;
  },
): Promise<{ itemsCreated: number }> {
  const url = new URL(input.source.baseUrl);
  const allowedHosts = [url.hostname];

  const maxItems = normalizeMaxItems(input.maxItems);
  const { licenseGate, licenseGateReason } = evaluateLicenseGate({
    licenseType: input.source.licenseType,
    lastVerifiedAt: input.source.lastVerifiedAt,
  });
  const fetchedAt = new Date();

  const res = await safeFetch({
    url: url.toString(),
    allowedHosts,
    allowedContentTypePrefixes: ['application/json', 'text/plain'],
    maxRedirects: 3,
    timeoutMs: 30_000,
    maxBytes: 60 * 1024 * 1024,
    headers: {
      'user-agent': 'synac-worker/0.0.0 (+https://github.com/amanthanvi/synac)',
    },
  });

  if (res.status !== 200) {
    throw new Error(`MITRE CTI fetch failed (${res.status}) for ${url.toString()}`);
  }

  let bundle: StixBundle;
  try {
    bundle = JSON.parse(res.body.toString('utf8')) as StixBundle;
  } catch {
    throw new Error('MITRE CTI response was not valid JSON');
  }

  const patterns = getAttackPatterns(bundle);

  let sourceDocumentId: string;
  try {
    const created = await prisma.sourceDocument.create({
      data: {
        sourceId: input.source.id,
        url: url.toString(),
        canonicalUrl: res.url,
        title: 'MITRE ATT&CK CTI (STIX bundle)',
        contentType: res.contentType,
        etag: res.etag,
        lastModified: res.lastModified,
        fetchedAt,
        contentSha256: res.sha256,
        snapshotAllowed: false,
        snapshotStorageUri: null,
      },
      select: { id: true },
    });
    sourceDocumentId = created.id;
  } catch (err) {
    const existing = await prisma.sourceDocument.findFirst({
      where: { sourceId: input.source.id, url: url.toString(), contentSha256: res.sha256 },
      select: { id: true },
    });
    if (!existing) throw err;
    sourceDocumentId = existing.id;
  }

  let itemsCreated = 0;
  for (const p of patterns.slice(0, maxItems)) {
    const title = p.name;
    const normalizedTitle = normalizeTitle(title);
    const extracted = {
      title,
      descriptionMd: p.description.trim(),
      fetchedAt: fetchedAt.toISOString(),
      url: url.toString(),
      canonicalUrl: res.url,
      contentType: res.contentType,
      ...(res.etag ? { etag: res.etag } : {}),
      ...(res.lastModified ? { lastModified: res.lastModified } : {}),
      sha256: res.sha256,
      sourceLocator: {
        stixId: p.stixId,
        externalId: p.externalId,
      },
    } satisfies Prisma.InputJsonObject;

    const createEntryProposedChange = {
      kind: 'CREATE_ENTRY',
      entryType: 'TERM',
      displayTitle: title,
      summaryMd: summarize(p.description),
      senses: [
        {
          definitionMd: p.description.trim(),
          contentMode: 'QUOTED',
          extractionMethod: 'API',
          extractorVersion: 'synac-worker/0.0.0',
          sourceLocator: {
            stixId: p.stixId,
            externalId: p.externalId,
          },
        },
      ],
    };

    const stageOutputs: Record<string, Prisma.InputJsonValue> = { extracted };

    const ingestItem = await prisma.ingestItem.create({
      data: {
        ingestRunId: input.ingestRunId,
        sourceDocumentId,
        itemKey: p.externalId,
        stage: 'EXTRACTED',
        stageOutputs,
        confidenceScore: 0.9,
        licenseGate,
        licenseGateReason,
      },
      select: { id: true },
    });

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
      where: { entryType: 'TERM', normalizedTitle, deletedAt: null },
      select: { id: true, displayTitle: true },
    });

    const proposedChange = existingEntry
      ? {
          kind: 'ADD_SENSES',
          entryId: existingEntry.id,
          entryType: 'TERM',
          displayTitle: existingEntry.displayTitle,
          senses: createEntryProposedChange.senses,
        }
      : createEntryProposedChange;

    stageOutputs.deduped = existingEntry
      ? { matchedEntryId: existingEntry.id, matchType: 'NORMALIZED_TITLE_EXACT', action: 'ADD_SENSES' }
      : { action: 'CREATE_ENTRY' };

    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'DEDUPED',
        proposedChange,
        stageOutputs,
      },
      select: { id: true },
    });

    stageOutputs.enriched = {};
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'ENRICHED',
        stageOutputs,
      },
      select: { id: true },
    });

    stageOutputs.validated = { ok: true };
    await prisma.ingestItem.update({
      where: { id: ingestItem.id },
      data: {
        stage: 'VALIDATED',
        error: null,
        stageOutputs,
      },
      select: { id: true },
    });

    itemsCreated += 1;
  }

  return { itemsCreated };
}
