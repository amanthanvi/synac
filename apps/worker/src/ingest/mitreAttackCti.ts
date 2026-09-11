import { normalizeTitle } from '@synac/db';

import { buildExtractorVersion } from '../version.js';
import type {
  AdapterContext,
  IngestAdapter,
  JsonObject,
  ParseOutcome,
  ParsedEntry,
  ParsedRelationship,
} from './adapter.js';
import {
  fetchWithPolicy,
  resolveContentMode,
  upsertSourceDocument,
} from './adapter.js';
import { stripStixCitations } from './stixText.js';
import { firstParagraph, normalizeMaxItems } from './textHeuristics.js';

export const ADAPTER_VERSION = 'mitre-attack@2';

export const MITRE_ADAPTER_SLUGS = [
  'mitre-attack-cti',
  'mitre-attack-mobile-cti',
  'mitre-attack-ics-cti',
] as const;

type StixKillChainPhase = { kill_chain_name?: string; phase_name?: string };

type StixObject = {
  type?: string;
  id?: string;
  name?: string;
  description?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  x_mitre_shortname?: string;
  kill_chain_phases?: StixKillChainPhase[];
  external_references?: Array<{ source_name?: string; external_id?: string }>;
};

type StixBundle = { objects?: unknown[] };

export type MitreAttackPattern = {
  stixId: string;
  externalId: string;
  name: string;
  description: string;
  tacticPhaseNames: string[];
};

function getAttackExternalId(pattern: StixObject): string | null {
  const refs = Array.isArray(pattern.external_references)
    ? pattern.external_references
    : [];
  for (const ref of refs) {
    const sourceName = ref?.source_name;
    const externalId = ref?.external_id;
    if (
      sourceName === 'mitre-attack' &&
      typeof externalId === 'string' &&
      externalId.trim()
    ) {
      return externalId.trim();
    }
  }
  return null;
}

/** `defense-evasion` -> `Defense Evasion`, used when the bundle has no tactic object. */
export function titleCasePhaseName(phaseName: string): string {
  return phaseName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (word[0] ?? '').toUpperCase() + word.slice(1))
    .join(' ');
}

/** Maps `x_mitre_shortname` (== `phase_name`) to the tactic's display name. */
export function collectTacticNames(bundle: StixBundle): Map<string, string> {
  const out = new Map<string, string>();
  const objects = Array.isArray(bundle.objects) ? bundle.objects : [];

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    // Every field of `StixObject` is optional, so the assertion promises nothing
    // beyond "this is an object"; each read below is still guarded.
    const v = obj as StixObject;
    if (v.type !== 'x-mitre-tactic') continue;
    if (v.revoked || v.x_mitre_deprecated) continue;
    const shortname =
      typeof v.x_mitre_shortname === 'string' ? v.x_mitre_shortname.trim() : '';
    const name = typeof v.name === 'string' ? v.name.trim() : '';
    if (!shortname || !name) continue;
    out.set(shortname, name);
  }

  return out;
}

export function getAttackPatterns(bundle: StixBundle): MitreAttackPattern[] {
  const objects = Array.isArray(bundle.objects) ? bundle.objects : [];
  const out: MitreAttackPattern[] = [];

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    // See `collectTacticNames`: the assertion only names the optional fields.
    const v = obj as StixObject;
    if (v.type !== 'attack-pattern') continue;
    if (v.revoked || v.x_mitre_deprecated) continue;

    const stixId = typeof v.id === 'string' ? v.id : '';
    const name = typeof v.name === 'string' ? v.name : '';
    const description = typeof v.description === 'string' ? v.description : '';
    const externalId = getAttackExternalId(v) ?? '';

    if (!stixId || !name || !description || !externalId) continue;

    const phases = Array.isArray(v.kill_chain_phases)
      ? v.kill_chain_phases
      : [];
    const tacticPhaseNames: string[] = [];
    for (const phase of phases) {
      if (phase?.kill_chain_name && !phase.kill_chain_name.startsWith('mitre'))
        continue;
      const phaseName =
        typeof phase?.phase_name === 'string' ? phase.phase_name.trim() : '';
      if (phaseName && !tacticPhaseNames.includes(phaseName))
        tacticPhaseNames.push(phaseName);
    }

    out.push({ stixId, externalId, name, description, tacticPhaseNames });
  }

  return out;
}

/**
 * A technique is an instance of a tactic, so the tactic is the broader concept.
 * Targets that do not exist as entries yet are simply not emitted; the apply
 * path also skips unresolvable targets, so this is belt and braces.
 */
export function buildTacticRelationships(
  pattern: MitreAttackPattern,
  tacticNames: Map<string, string>,
): ParsedRelationship[] {
  const out: ParsedRelationship[] = [];
  const seen = new Set<string>();

  for (const phaseName of pattern.tacticPhaseNames) {
    const targetTitle =
      tacticNames.get(phaseName) ?? titleCasePhaseName(phaseName);
    if (!targetTitle) continue;
    const key = normalizeTitle(targetTitle);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: 'BROADER_THAN',
      targetTitle,
      note: `ATT&CK tactic for technique ${pattern.externalId}`,
    });
  }

  return out;
}

async function parse(ctx: AdapterContext): Promise<ParseOutcome> {
  const url = new URL(ctx.source.baseUrl);
  const allowedHosts = [url.hostname];
  const maxItems = normalizeMaxItems(ctx.maxItems);
  const fetchedAt = new Date();

  const contentMode = resolveContentMode({
    defaultContentMode: ctx.source.defaultContentMode,
    verbatimOnly: true,
  });
  const extractorVersion = buildExtractorVersion(ADAPTER_VERSION);

  const fetched = await fetchWithPolicy({
    url: url.toString(),
    source: ctx.source,
    allowedHosts,
    allowedContentTypePrefixes: ['application/json', 'text/plain'],
    maxBytes: 60 * 1024 * 1024,
    timeoutMs: 30_000,
  });

  if (!fetched.ok) {
    return { entries: [], skipped: 1, failed: 0 };
  }

  const res = fetched.response;
  if (res.status !== 200) {
    throw new Error(
      `MITRE CTI fetch failed (${res.status}) for ${url.toString()}`,
    );
  }

  let bundle: StixBundle;
  try {
    // `StixBundle` has one optional field, so this only labels the parse result;
    // `getAttackPatterns` and `collectTacticNames` re-check the shape.
    bundle = JSON.parse(res.body.toString('utf8')) as StixBundle;
  } catch {
    throw new Error('MITRE CTI response was not valid JSON');
  }

  const document = await upsertSourceDocument(ctx.prisma, {
    sourceId: ctx.source.id,
    url: url.toString(),
    canonicalUrl: res.url,
    title: 'MITRE ATT&CK CTI (STIX bundle)',
    contentType: res.contentType,
    etag: res.etag,
    lastModified: res.lastModified,
    fetchedAt,
    contentSha256: res.sha256,
    snapshotAllowed: false,
  });

  const tacticNames = collectTacticNames(bundle);
  const patterns = getAttackPatterns(bundle);

  const entries: ParsedEntry[] = [];
  let failed = 0;

  for (const p of patterns.slice(0, maxItems)) {
    // STIX descriptions carry inline `(Citation: ...)` markers; provenance is
    // recorded structurally, so they are stripped from the stored prose.
    const definitionMd = stripStixCitations(p.description);
    if (!definitionMd.trim()) {
      failed += 1;
      continue;
    }
    const summaryMd = stripStixCitations(firstParagraph(p.description));

    const sourceLocator = { stixId: p.stixId, externalId: p.externalId };

    const extracted: JsonObject = {
      title: p.name,
      descriptionMd: definitionMd,
      tacticPhaseNames: p.tacticPhaseNames,
      fetchedAt: fetchedAt.toISOString(),
      url: url.toString(),
      canonicalUrl: res.url,
      contentType: res.contentType,
      sha256: res.sha256,
      sourceLocator,
    };
    if (res.etag) extracted.etag = res.etag;
    if (res.lastModified) extracted.lastModified = res.lastModified;

    const relationships = buildTacticRelationships(p, tacticNames);

    const parsed: ParsedEntry = {
      itemKey: p.externalId,
      sourceDocumentId: document.id,
      fetchedAt,
      entryType: 'TERM',
      displayTitle: p.name,
      normalizedTitle: normalizeTitle(p.name),
      summaryMd: summaryMd || definitionMd,
      senses: [{ definitionMd, sourceLocator }],
      contentMode,
      // A JSON/STIX bundle fetch, not HTML scraping.
      extractionMethod: 'API',
      extractorVersion,
      confidenceScore: 0.9,
      extracted,
    };
    if (relationships.length) parsed.relationships = relationships;

    entries.push(parsed);
  }

  return { entries, skipped: 0, failed };
}

/** The three ATT&CK domains (enterprise, mobile, ICS) share one parser. */
export const mitreAttackCtiAdapters: IngestAdapter[] = MITRE_ADAPTER_SLUGS.map(
  (slug) => ({ slug, version: ADAPTER_VERSION, parse }),
);
