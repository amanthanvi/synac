import type { Prisma, PrismaClient } from '@synac/db';

import { safeFetch } from '../net/safeFetch.js';
import { evaluateLicenseGate } from './licenseGate.js';
import { extractAllByIdPrefix, extractFirstById, extractHrefPaths } from './html.js';

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

export async function ingestNistGlossary(
  prisma: PrismaClient,
  input: {
    ingestRunId: string;
    source: { id: string; baseUrl: string; licenseType: string; lastVerifiedAt: Date | null };
    maxItems: number;
  },
): Promise<{ itemsCreated: number }> {
  const base = new URL(input.source.baseUrl);
  const origin = base.origin;
  const allowedHosts = [base.hostname];

  const maxItems = normalizeMaxItems(input.maxItems);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const termUrls: string[] = [];
  const seen = new Set<string>();

  const indexUrls = [new URL('/glossary', origin).toString(), ...letters.map((l) => new URL(`/glossary?index=${l}`, origin).toString())];

  for (const indexUrl of indexUrls) {
    if (seen.size >= maxItems) break;

    const res = await safeFetch({
      url: indexUrl,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxRedirects: 3,
      timeoutMs: 15_000,
      maxBytes: 5 * 1024 * 1024,
      headers: {
        'user-agent': 'synac-worker/0.0.0 (+https://github.com/amanthanvi/synac)',
      },
    });

    if (res.status !== 200) {
      throw new Error(`NIST glossary index fetch failed (${res.status}) for ${indexUrl}`);
    }

    const html = res.body.toString('utf8');
    const hrefs = extractHrefPaths(html, '/glossary/term/');
    for (const href of hrefs) {
      const abs = new URL(href, origin).toString();
      if (seen.has(abs)) continue;
      seen.add(abs);
      termUrls.push(abs);
      if (seen.size >= maxItems) break;
    }
  }

  let itemsCreated = 0;
  const { licenseGate, licenseGateReason } = evaluateLicenseGate({
    licenseType: input.source.licenseType,
    lastVerifiedAt: input.source.lastVerifiedAt,
  });

  for (const termUrl of termUrls.slice(0, maxItems)) {
    const fetchedAt = new Date();

    const res = await safeFetch({
      url: termUrl,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxRedirects: 3,
      timeoutMs: 15_000,
      maxBytes: 5 * 1024 * 1024,
      headers: {
        'user-agent': 'synac-worker/0.0.0 (+https://github.com/amanthanvi/synac)',
      },
    });

    if (res.status !== 200) {
      continue;
    }

    const html = res.body.toString('utf8');
    const title = extractFirstById(html, 'h3', 'term-text');
    const definitions = extractAllByIdPrefix(html, 'span', 'term-def-text-');
    const definition = definitions[0] ?? null;

    if (!title || !definition) continue;

    const normalizedTitle = normalizeTitle(title);
    const extracted = {
      title,
      definitionMd: definition,
      fetchedAt: fetchedAt.toISOString(),
      url: termUrl,
      canonicalUrl: res.url,
      contentType: res.contentType,
      ...(res.etag ? { etag: res.etag } : {}),
      ...(res.lastModified ? { lastModified: res.lastModified } : {}),
      sha256: res.sha256,
      sourceLocator: { selector: '#term-def-text-0' },
    } satisfies Prisma.InputJsonObject;

    const createEntryProposedChange = {
      kind: 'CREATE_ENTRY',
      entryType: 'TERM',
      displayTitle: title,
      summaryMd: definition,
      senses: [
        {
          definitionMd: definition,
          contentMode: 'QUOTED',
          extractionMethod: 'HTML',
          extractorVersion: 'synac-worker/0.0.0',
          sourceLocator: { selector: '#term-def-text-0' },
        },
      ],
    };

    let sourceDocumentId: string;
    try {
      const created = await prisma.sourceDocument.create({
        data: {
          sourceId: input.source.id,
          url: termUrl,
          canonicalUrl: res.url,
          title,
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
        where: { sourceId: input.source.id, url: termUrl, contentSha256: res.sha256 },
        select: { id: true },
      });
      if (!existing) throw err;
      sourceDocumentId = existing.id;
    }

    const stageOutputs: Record<string, Prisma.InputJsonValue> = { extracted };

    const ingestItem = await prisma.ingestItem.create({
      data: {
        ingestRunId: input.ingestRunId,
        sourceDocumentId,
        itemKey: termUrl,
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

    const hasDefinition = Array.isArray((proposedChange as Record<string, unknown>).senses)
      ? (proposedChange as { senses: Array<{ definitionMd: string }> }).senses.some((s) => Boolean(s.definitionMd?.trim()))
      : false;

    if (!hasDefinition) {
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
      continue;
    }

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
