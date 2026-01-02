import type { PrismaClient } from '@synac/db';

import { safeFetch } from '../net/safeFetch.js';
import { extractAllByIdPrefix, extractFirstById, extractHrefPaths } from './html.js';

function licenseGateFor(licenseType: string): 'PASS' | 'WARN' | 'FAIL' {
  const v = licenseType.toUpperCase();
  if (v === 'PUBLIC_DOMAIN' || v === 'CC0_1_0' || v.startsWith('CC_BY')) return 'PASS';
  if (v === 'PROPRIETARY') return 'FAIL';
  return 'WARN';
}

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

export async function ingestNistGlossary(
  prisma: PrismaClient,
  input: {
    ingestRunId: string;
    source: { id: string; baseUrl: string; licenseType: string };
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
  const licenseGate = licenseGateFor(input.source.licenseType);

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

    const proposedChange = {
      kind: 'CREATE_ENTRY',
      entryType: 'TERM',
      displayTitle: title,
      summaryMd: definition,
      senses: [
        {
          definitionMd: definition,
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

    await prisma.ingestItem.create({
      data: {
        ingestRunId: input.ingestRunId,
        sourceDocumentId,
        itemKey: termUrl,
        stage: 'VALIDATED',
        proposedChange,
        confidenceScore: 0.9,
        licenseGate,
      },
      select: { id: true },
    });

    itemsCreated += 1;
  }

  return { itemsCreated };
}

