import { slugify } from '@synac/content-tools';

import { safeFetch } from '../net/safeFetch.js';
import { finalizeBundle, type AdapterContext, type DraftEntry } from '../bundle.js';
import type { BundleFile } from '@synac/content-tools';

export const ADAPTER_VERSION = 'mitre-attack-cti/1.0.0';
const DOCUMENT_KEY = 'mitre-attack-enterprise-json';
const USER_AGENT = 'synac-ingest/1.0 (+https://github.com/amanthanvi/synac)';

type StixAttackPattern = {
  type?: string;
  id?: string;
  name?: string;
  description?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  external_references?: Array<{ source_name?: string; external_id?: string }>;
};

export type StixBundle = {
  objects?: unknown[];
};

export type AttackPattern = {
  stixId: string;
  externalId: string;
  name: string;
  description: string;
};

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

export function getAttackPatterns(bundle: StixBundle): AttackPattern[] {
  const objects = Array.isArray(bundle.objects) ? bundle.objects : [];
  const out: AttackPattern[] = [];

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

/** Maps ATT&CK techniques onto bundle entries, deduplicating slug collisions. */
export function bundleEntriesFromPatterns(patterns: AttackPattern[], maxItems: number): DraftEntry[] {
  const out: DraftEntry[] = [];
  const seenKeys = new Set<string>();

  for (const pattern of patterns.slice(0, maxItems)) {
    const slug = slugify(pattern.name);
    if (!slug) continue;
    const key = `TERM:${slug}`;
    if (seenKeys.has(key)) continue;

    const summaryMd = summarize(pattern.description);
    if (!summaryMd) continue;
    seenKeys.add(key);

    out.push({
      entryType: 'TERM',
      slug,
      title: pattern.name,
      aliases: [],
      tags: [],
      summaryMd,
      senses: [
        {
          key: pattern.externalId,
          label: pattern.externalId,
          definitionMd: pattern.description.trim(),
          examples: [],
          citation: {
            documentKey: DOCUMENT_KEY,
            citationText: `MITRE ATT&CK, ${pattern.externalId} ${pattern.name}`,
            locator: pattern.stixId,
          },
        },
      ],
      relationships: [],
    });
  }

  return out;
}

export async function runMitreAttackCti(ctx: AdapterContext): Promise<BundleFile> {
  const url = new URL(ctx.source.baseUrl);

  const res = await safeFetch({
    url: url.toString(),
    allowedHosts: [url.hostname],
    allowedContentTypePrefixes: ['application/json', 'text/plain'],
    maxRedirects: 3,
    timeoutMs: 30_000,
    maxBytes: 60 * 1024 * 1024,
    headers: {
      'user-agent': USER_AGENT,
    },
  });
  if (res.status !== 200) {
    throw new Error(`MITRE CTI fetch failed (${res.status}) for ${url.toString()}`);
  }

  // Upstream unchanged: keep the previous bundle byte-identical.
  const previousDocument = ctx.previous?.documents.find((doc) => doc.key === DOCUMENT_KEY);
  if (ctx.previous && previousDocument?.contentSha256 === res.sha256) {
    return ctx.previous;
  }

  let bundle: StixBundle;
  try {
    bundle = JSON.parse(res.body.toString('utf8')) as StixBundle;
  } catch {
    throw new Error('MITRE CTI response was not valid JSON');
  }

  const patterns = getAttackPatterns(bundle);

  return finalizeBundle({
    source: ctx.source,
    adapterVersion: ADAPTER_VERSION,
    documents: [
      {
        key: DOCUMENT_KEY,
        url: url.toString(),
        title: 'MITRE ATT&CK CTI (STIX bundle)',
        contentType: res.contentType.split(';')[0]!.trim() || 'application/json',
        contentSha256: res.sha256,
        fetchedAt: ctx.now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
    ],
    entries: bundleEntriesFromPatterns(patterns, ctx.maxItems),
    previous: ctx.previous,
    now: ctx.now,
  });
}
