import type { InputJsonObject, InputJsonValue, PrismaClient } from '@synac/db';

import { safeFetch } from '../net/safeFetch.js';
import { evaluateLicenseGate } from './licenseGate.js';

type DefinitionType = 'I' | 'N' | 'O' | 'D';

type ParsedSense = {
  definitionType: DefinitionType;
  senseLabel: string | null;
  definitionMd: string;
  expandedForm: string | null;
};

type ParsedEntry = {
  title: string;
  normalizedTitle: string;
  entryType: 'TERM' | 'ACRONYM';
  summaryMd: string;
  senses: ParsedSense[];
  variants: Array<{ variantText: string; variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' }>;
  sourceLocator: { line: number; title: string };
};

const BASE_INDENT = '      ';

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return 200;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function normalizeTitle(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function stripBaseIndent(value: string): string {
  if (value.startsWith(BASE_INDENT)) return value.slice(BASE_INDENT.length);
  return value.trimStart();
}

function isPageNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed === '\f' || trimmed === '') return true;
  if (trimmed.startsWith('RFC 4949')) return true;
  if (trimmed.startsWith('Shirey') && trimmed.includes('[Page')) return true;
  return false;
}

function normalizeDefinitionWhitespace(value: string): string {
  const lines = value
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line, idx, all) => {
      if (line.trim()) return true;
      const prev = all[idx - 1]?.trim();
      const next = all[idx + 1]?.trim();
      return Boolean(prev || next);
    });

  const out: string[] = [];
  let blankStreak = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blankStreak += 1;
      if (blankStreak <= 1) out.push('');
      continue;
    }
    blankStreak = 0;
    out.push(line);
  }

  return out.join('\n').trim();
}

function inferEntryTypeFromTitle(value: string): 'TERM' | 'ACRONYM' {
  const v = value.trim();
  if (!v) return 'TERM';
  if (v.includes(' ')) return 'TERM';
  if (v.length < 2 || v.length > 32) return 'TERM';

  const letters = v.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1) return 'TERM';

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  const lowercase = letters.replace(/[^a-z]/g, '').length;
  const digits = v.replace(/[^0-9]/g, '').length;

  if (uppercase >= 2 && lowercase <= 2) return 'ACRONYM';
  if (uppercase >= 1 && digits >= 1 && letters.length <= 2 && lowercase === 0) return 'ACRONYM';

  return 'TERM';
}

function inferVariantType(value: string): 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' {
  const v = value.trim();
  if (!v) return 'ALIAS';
  if (v.includes(' ')) return 'SYNONYM';

  const compact = v.replace(/[.\-_/]/g, '');
  const isAllCaps =
    compact.length >= 2 &&
    compact === compact.toUpperCase() &&
    /[A-Z]/.test(compact) &&
    /^[A-Z0-9]+$/.test(compact);
  if (isAllCaps && v.length <= 24) return 'ABBREVIATION';

  return 'ALIAS';
}

function stripTrailingAbbreviation(title: string): { mainTitle: string; abbreviation: string | null } {
  const trimmed = title.trim();
  const match = trimmed.match(/^(.*)\s+\(([^)]+)\)\s*$/);
  if (!match) return { mainTitle: trimmed, abbreviation: null };

  const main = (match[1] ?? '').trim();
  const abbr = (match[2] ?? '').trim();

  if (!main) return { mainTitle: trimmed, abbreviation: null };
  if (!abbr || abbr.includes(' ') || abbr.length > 32) return { mainTitle: trimmed, abbreviation: null };

  return { mainTitle: main, abbreviation: abbr };
}

function parseDefinitionHeader(line: string): {
  indexLabel: string | null;
  definitionType: DefinitionType;
  context: string | null;
  rest: string;
} | null {
  const trimmed = stripBaseIndent(line);
  const match = trimmed.match(/^(?:(\d+[a-z]?)\.\s+)?\(([INOD])\)\s*(.*)$/);
  if (!match) return null;

  const indexLabel = match[1] ? match[1] : null;
  const definitionType = match[2] as DefinitionType;
  const afterType = (match[3] ?? '').trim();

  const ctxMatch = afterType.match(/^\/([^/]+)\/\s*(.*)$/);
  const context = ctxMatch ? ctxMatch[1]!.trim() : null;
  const rest = (ctxMatch ? ctxMatch[2] : afterType).trim();

  return { indexLabel, definitionType, context: context || null, rest };
}

function buildSenseLabel(input: { indexLabel: string | null; definitionType: DefinitionType; context: string | null }): string {
  const parts: string[] = [];
  if (input.indexLabel) parts.push(input.indexLabel);
  parts.push(`(${input.definitionType})`);
  if (input.context) parts.push(`/${input.context}/`);
  return parts.join(' ');
}

function inferExpandedFormFromDefinition(input: {
  entryType: 'TERM' | 'ACRONYM';
  definitionMd: string;
}): string | null {
  if (input.entryType !== 'ACRONYM') return null;

  const text = input.definitionMd.trim();
  const seeMatch = text.match(/^See:\s*([^.\n]+)\./i);
  const synonymMatch = text.match(/^(?:Synonym|Abbreviation)\s+for\s+"([^"]+)"/i);

  const candidate = (synonymMatch?.[1] ?? seeMatch?.[1] ?? '').trim();
  if (!candidate) return null;
  if (!candidate.includes(' ')) return null;
  if (/^(Deprecated|Tutorial|Usage)\b/i.test(candidate)) return null;
  if (candidate.length > 200) return null;

  return candidate;
}

export function parseRfc4949Entries(input: string): ParsedEntry[] {
  const text = input.replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  const entries: Array<{ title: string; startLine: number; lines: string[] }> = [];
  let current: { title: string; startLine: number; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const match = line.match(/^\s*\$\s+(.+?)\s*$/);
    if (match) {
      if (current) entries.push(current);
      current = { title: match[1]!.trim(), startLine: i + 1, lines: [] };
      continue;
    }

    if (current) current.lines.push(line);
  }
  if (current) entries.push(current);

  const parsed: ParsedEntry[] = [];

  for (const entry of entries) {
    const { mainTitle, abbreviation } = stripTrailingAbbreviation(entry.title);
    const normalized = normalizeTitle(mainTitle);
    if (!normalized) continue;

    const variants = (() => {
      const out: Array<{ variantText: string; variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' }> = [];
      const seen = new Set<string>();

      if (abbreviation) {
        const key = normalizeTitle(abbreviation);
        if (!seen.has(key) && key !== normalized) {
          seen.add(key);
          out.push({ variantText: abbreviation, variantType: inferVariantType(abbreviation) });
        }
      }

      return out;
    })();

    const entryType = inferEntryTypeFromTitle(mainTitle);

    const cleanedLines = entry.lines.filter((line) => !isPageNoiseLine(line));

    const senses: ParsedSense[] = [];
    let currentHeader: ReturnType<typeof parseDefinitionHeader> | null = null;
    let currentLines: string[] = [];

    const flush = () => {
      if (!currentHeader) return;
      const definitionMd = normalizeDefinitionWhitespace(currentLines.join('\n'));
      const expandedForm = inferExpandedFormFromDefinition({ entryType, definitionMd });
      senses.push({
        definitionType: currentHeader.definitionType,
        senseLabel: buildSenseLabel({
          indexLabel: currentHeader.indexLabel,
          definitionType: currentHeader.definitionType,
          context: currentHeader.context,
        }),
        definitionMd,
        expandedForm,
      });
    };

    for (const rawLine of cleanedLines) {
      const header = parseDefinitionHeader(rawLine);
      if (header) {
        flush();
        currentHeader = header;
        currentLines = [];
        if (header.rest) currentLines.push(header.rest);
        continue;
      }

      if (!currentHeader) continue;
      currentLines.push(stripBaseIndent(rawLine));
    }

    flush();
    if (senses.length === 0) continue;

    const summaryMd = (() => {
      const first = senses[0]!;
      const firstParagraph = first.definitionMd.split(/\n\s*\n/)[0]?.trim() ?? '';
      return firstParagraph || first.definitionMd;
    })();
    if (!summaryMd.trim()) continue;

    parsed.push({
      title: mainTitle,
      normalizedTitle: normalized,
      entryType,
      summaryMd,
      senses,
      variants,
      sourceLocator: { line: entry.startLine, title: mainTitle },
    });
  }

  return parsed;
}

export async function ingestRfc4949Glossary(
  prisma: PrismaClient,
  input: {
    ingestRunId: string;
    source: { id: string; baseUrl: string; licenseType: string; lastVerifiedAt: Date | null };
    maxItems: number;
    forceReprocess: boolean;
  },
): Promise<{ itemsCreated: number }> {
  const url = new URL(input.source.baseUrl);
  const allowedHosts = [url.hostname];

  const maxItems = normalizeMaxItems(input.maxItems);
  const fetchedAt = new Date();

  const res = await safeFetch({
    url: url.toString(),
    allowedHosts,
    allowedContentTypePrefixes: ['text/plain'],
    maxRedirects: 3,
    timeoutMs: 30_000,
    maxBytes: 10 * 1024 * 1024,
    headers: {
      'user-agent': 'synac-worker/0.0.0 (+https://github.com/amanthanvi/synac)',
    },
  });

  if (res.status !== 200) {
    throw new Error(`RFC 4949 fetch failed (${res.status}) for ${url.toString()}`);
  }

  let sourceDocumentId: string;
  let sourceDocumentCreated = false;
  try {
    const created = await prisma.sourceDocument.create({
      data: {
        sourceId: input.source.id,
        url: url.toString(),
        canonicalUrl: res.url,
        title: 'RFC 4949 — Internet Security Glossary (Version 2)',
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
    sourceDocumentCreated = true;
  } catch (err) {
    const existing = await prisma.sourceDocument.findFirst({
      where: { sourceId: input.source.id, url: url.toString(), contentSha256: res.sha256 },
      select: { id: true },
    });
    if (!existing) throw err;
    sourceDocumentId = existing.id;
  }

  if (!sourceDocumentCreated && !input.forceReprocess) {
    return { itemsCreated: 0 };
  }

  const { licenseGate, licenseGateReason } = evaluateLicenseGate({
    licenseType: input.source.licenseType,
    lastVerifiedAt: input.source.lastVerifiedAt,
  });

  const text = res.body.toString('utf8');
  const parsedEntries = parseRfc4949Entries(text);

  let itemsCreated = 0;
  const seenItemKeys = new Set<string>();

  for (const entry of parsedEntries.slice(0, maxItems)) {
    const itemKey = `term:${entry.normalizedTitle}`;
    if (seenItemKeys.has(itemKey)) continue;
    seenItemKeys.add(itemKey);

    const extracted = {
      title: entry.title,
      fetchedAt: fetchedAt.toISOString(),
      url: url.toString(),
      canonicalUrl: res.url,
      contentType: res.contentType,
      ...(res.etag ? { etag: res.etag } : {}),
      ...(res.lastModified ? { lastModified: res.lastModified } : {}),
      sha256: res.sha256,
      sourceLocator: entry.sourceLocator,
    } satisfies InputJsonObject;

    const variants = entry.variants;

    const createEntryProposedChange = {
      kind: 'CREATE_ENTRY',
      entryType: entry.entryType,
      displayTitle: entry.title,
      summaryMd: entry.summaryMd,
      ...(variants.length ? { variants } : {}),
      senses: entry.senses.map((s) => ({
        ...(s.senseLabel ? { senseLabel: s.senseLabel } : {}),
        ...(s.expandedForm ? { expandedForm: s.expandedForm } : {}),
        definitionMd: s.definitionMd,
        contentMode: 'QUOTED',
        extractionMethod: 'HTML',
        extractorVersion: 'synac-worker/0.0.0',
        sourceLocator: entry.sourceLocator,
      })),
    };

    const stageOutputs: Record<string, InputJsonValue> = { extracted };

    const ingestItem = await prisma.ingestItem.create({
      data: {
        ingestRunId: input.ingestRunId,
        sourceDocumentId,
        itemKey,
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
        proposedChange: createEntryProposedChange as InputJsonValue,
        stageOutputs,
      },
      select: { id: true },
    });

    const existingEntry = await prisma.entry.findFirst({
      where: { entryType: entry.entryType, normalizedTitle: entry.normalizedTitle, deletedAt: null },
      select: { id: true, displayTitle: true },
    });

    const proposedChange = existingEntry
      ? {
          kind: 'ADD_SENSES',
          entryId: existingEntry.id,
          entryType: entry.entryType,
          displayTitle: existingEntry.displayTitle,
          ...(variants.length ? { variants } : {}),
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
        proposedChange: proposedChange as InputJsonValue,
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
