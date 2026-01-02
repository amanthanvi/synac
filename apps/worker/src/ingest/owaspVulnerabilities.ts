import type { Prisma, PrismaClient } from '@synac/db';

import { safeFetch } from '../net/safeFetch.js';
import { evaluateLicenseGate } from './licenseGate.js';
import {
  decodeHtmlEntities,
  extractFirstInnerHtmlByClass,
  extractHrefPaths,
  stripHtmlTags,
} from './html.js';

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string): string {
  return normalizeText(value).toLowerCase();
}

function htmlToText(value: string): string {
  return normalizeText(decodeHtmlEntities(stripHtmlTags(value)));
}

function extractOverviewParagraph(html: string): string | null {
  const section = html.match(/<h2[^>]*\bid=["']overview["'][^>]*>[\s\S]*?<\/h2>([\s\S]*?)(<h2|$)/i);
  const block = section?.[1];
  if (!block) return null;
  const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!p?.[1]) return null;
  return htmlToText(p[1]);
}

export async function ingestOwaspVulnerabilities(
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
  const { licenseGate, licenseGateReason } = evaluateLicenseGate({
    licenseType: input.source.licenseType,
    lastVerifiedAt: input.source.lastVerifiedAt,
  });

  const indexUrl = new URL('/www-community/vulnerabilities', origin).toString();
  const indexRes = await safeFetch({
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

  if (indexRes.status !== 200) {
    throw new Error(`OWASP vulnerabilities index fetch failed (${indexRes.status}) for ${indexUrl}`);
  }

  const indexHtml = indexRes.body.toString('utf8');
  const hrefs = extractHrefPaths(indexHtml, '/www-community/vulnerabilities/');

  const seen = new Set<string>();
  const pageUrls: string[] = [];
  for (const href of hrefs) {
    const abs = new URL(href, origin).toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    pageUrls.push(abs);
    if (pageUrls.length >= maxItems) break;
  }

  let itemsCreated = 0;

  for (const pageUrl of pageUrls) {
    const fetchedAt = new Date();
    const res = await safeFetch({
      url: pageUrl,
      allowedHosts,
      allowedContentTypePrefixes: ['text/html'],
      maxRedirects: 3,
      timeoutMs: 15_000,
      maxBytes: 5 * 1024 * 1024,
      headers: {
        'user-agent': 'synac-worker/0.0.0 (+https://github.com/amanthanvi/synac)',
      },
    });

    if (res.status !== 200) continue;

    const html = res.body.toString('utf8');
    const titleHtml = extractFirstInnerHtmlByClass(html, 'h1', 'page-title');
    const title = titleHtml ? htmlToText(titleHtml) : null;
    if (!title) continue;

    const overview = extractOverviewParagraph(html);
    if (!overview) continue;

    const normalizedTitle = normalizeTitle(title);
    const extracted = {
      title,
      overviewMd: overview,
      fetchedAt: fetchedAt.toISOString(),
      url: pageUrl,
      canonicalUrl: res.url,
      contentType: res.contentType,
      ...(res.etag ? { etag: res.etag } : {}),
      ...(res.lastModified ? { lastModified: res.lastModified } : {}),
      sha256: res.sha256,
      sourceLocator: { headingId: 'overview' },
    } satisfies Prisma.InputJsonObject;

    let sourceDocumentId: string;
    try {
      const created = await prisma.sourceDocument.create({
        data: {
          sourceId: input.source.id,
          url: pageUrl,
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
        where: { sourceId: input.source.id, url: pageUrl, contentSha256: res.sha256 },
        select: { id: true },
      });
      if (!existing) throw err;
      sourceDocumentId = existing.id;
    }

    const createEntryProposedChange = {
      kind: 'CREATE_ENTRY',
      entryType: 'TERM',
      displayTitle: title,
      summaryMd: overview,
      senses: [
        {
          definitionMd: overview,
          contentMode: 'QUOTED',
          extractionMethod: 'HTML',
          extractorVersion: 'synac-worker/0.0.0',
          sourceLocator: { headingId: 'overview' },
        },
      ],
    };

    const stageOutputs: Record<string, Prisma.InputJsonValue> = { extracted };

    const ingestItem = await prisma.ingestItem.create({
      data: {
        ingestRunId: input.ingestRunId,
        sourceDocumentId,
        itemKey: pageUrl,
        stage: 'EXTRACTED',
        stageOutputs,
        confidenceScore: 0.85,
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
