/**
 * One-time transform: a `npx convex export` snapshot (extracted ZIP, one
 * `<table>/documents.jsonl` per table, in the PRE-cutover schema) -> content/ files.
 *
 * Usage: tsx src/bootstrap-from-export.ts <extracted-snapshot-dir> [<content-dir>]
 *
 * Only PUBLISHED, non-deleted entries and senses are carried over — the git
 * repo becomes the source of truth for exactly what the site serves. Anything
 * that cannot be mapped is listed in the report printed at the end.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

type Row = Record<string, unknown>;

function str(row: Row, field: string): string | undefined {
  const value = row[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(row: Row, field: string): number | undefined {
  const value = row[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isoDate(ms: number | undefined, fallback: string): string {
  if (!ms) return fallback;
  return new Date(ms).toISOString().slice(0, 10);
}

function isoDateTime(ms: number | undefined, fallback: string): string {
  if (!ms) return fallback;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function readTable(snapshotDir: string, table: string): Promise<Row[]> {
  const filePath = path.join(snapshotDir, table, 'documents.jsonl');
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Row);
}

const ADAPTER_BY_HOST: Record<string, string> = {
  'csrc.nist.gov': 'nistGlossary',
  'niccs.cisa.gov': 'niccsGlossary',
  'owasp.org': 'owaspVulnerabilities',
  'www.owasp.org': 'owaspVulnerabilities',
  'raw.githubusercontent.com': 'mitreAttackCti',
  'www.rfc-editor.org': 'rfc4949Glossary',
  'rfc-editor.org': 'rfc4949Glossary',
};

const LICENSE_TYPE_MAP: Record<string, string> = {
  PUBLIC_DOMAIN: 'PUBLIC_DOMAIN',
  US_GOV_PD: 'US_GOV_PD',
  US_GOVERNMENT: 'US_GOV_PD',
  CC_BY_4_0: 'CC_BY_4_0',
  'CC-BY-4.0': 'CC_BY_4_0',
  CC_BY_SA_4_0: 'CC_BY_SA_4_0',
  'CC-BY-SA-4.0': 'CC_BY_SA_4_0',
  APACHE_2_0: 'APACHE_2_0',
  MIT: 'MIT',
};

export type BootstrapResult = {
  files: Map<string, unknown>;
  report: string[];
};

export async function bootstrapFromExport(snapshotDir: string): Promise<BootstrapResult> {
  const report: string[] = [];
  const files = new Map<string, unknown>();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = `${today}T00:00:00Z`;

  const [sources, sourceDocuments, citations, provenance, entries, senses, senseExamples, variants, tags, entryTags, relationships, slugHistory] =
    await Promise.all([
      readTable(snapshotDir, 'sources'),
      readTable(snapshotDir, 'sourceDocuments'),
      readTable(snapshotDir, 'citations'),
      readTable(snapshotDir, 'fieldProvenance'),
      readTable(snapshotDir, 'entries'),
      readTable(snapshotDir, 'senses'),
      readTable(snapshotDir, 'senseExamples'),
      readTable(snapshotDir, 'entryVariants'),
      readTable(snapshotDir, 'tags'),
      readTable(snapshotDir, 'entryTags'),
      readTable(snapshotDir, 'entryRelationships'),
      readTable(snapshotDir, 'entrySlugHistory'),
    ]);

  // --- sources ---
  const sourceById = new Map<string, Row>();
  const sourceSlugById = new Map<string, string>();
  for (const source of sources) {
    const id = str(source, 'id');
    const slug = str(source, 'sourceSlug');
    const baseUrl = str(source, 'baseUrl');
    if (!id || !slug || !baseUrl) {
      report.push(`source skipped (missing id/slug/baseUrl): ${JSON.stringify(source).slice(0, 120)}`);
      continue;
    }
    sourceById.set(id, source);
    sourceSlugById.set(id, slug);
    const host = new URL(baseUrl).hostname.toLowerCase();
    const adapter = ADAPTER_BY_HOST[host];
    if (!adapter) report.push(`source ${slug}: no known adapter for host ${host}; ingest config omitted`);
    files.set(`sources/${slug}.json`, {
      slug,
      name: str(source, 'name') ?? slug,
      baseUrl,
      license: {
        type: LICENSE_TYPE_MAP[str(source, 'licenseType') ?? ''] ?? 'OTHER',
        notes: str(source, 'licenseNotes'),
        allowedUse: str(source, 'allowedUse') ?? 'REVIEW REQUIRED',
        attributionRequirements: str(source, 'attributionRequirements') ?? 'REVIEW REQUIRED',
      },
      accessMethod: host === 'raw.githubusercontent.com' ? 'JSON' : host.includes('rfc-editor') ? 'TEXT' : 'HTML',
      trustTier: ['TIER1', 'TIER2', 'TIER3'].includes(str(source, 'trustTier') ?? '') ? str(source, 'trustTier') : 'TIER2',
      enabled: source.enabled === true,
      ...(adapter ? { ingest: { adapter, schedule: 'weekly' } } : {}),
      contact: str(source, 'contact'),
      lastVerifiedAt: isoDate(num(source, 'lastVerifiedAt') ?? undefined, today),
    });
  }

  // --- tags ---
  const tagSlugById = new Map<string, string>();
  const tagList = [];
  for (const tag of tags) {
    const id = str(tag, 'id');
    const slug = str(tag, 'slug');
    if (!id || !slug || tag.deletedAt) continue;
    tagSlugById.set(id, slug);
    tagList.push({ slug, name: str(tag, 'name') ?? slug, description: str(tag, 'description') });
  }
  files.set('tags.json', { tags: tagList.sort((a, b) => a.slug.localeCompare(b.slug)) });

  // --- documents / citations / provenance lookups ---
  const documentById = new Map(sourceDocuments.map((doc) => [str(doc, 'id') ?? '', doc]));
  const citationById = new Map(citations.map((citation) => [str(citation, 'id') ?? '', citation]));
  const provenanceBySense = new Map<string, Row[]>();
  for (const row of provenance) {
    if (str(row, 'entityType') !== 'SENSE') continue;
    const senseId = str(row, 'entityId');
    if (!senseId) continue;
    const list = provenanceBySense.get(senseId) ?? [];
    list.push(row);
    provenanceBySense.set(senseId, list);
  }

  // --- entries and senses, distributed into per-source bundles ---
  type BundleAcc = {
    documents: Map<string, Row>;
    entries: Map<string, { entry: Row; senses: Array<{ sense: Row; citation: Row; document: Row }> }>;
  };
  const bundles = new Map<string, BundleAcc>();
  const editorialOverrides = new Map<string, Row & { editorial: Array<Row> }>();

  const entryById = new Map<string, Row>();
  const publishedEntries = entries.filter(
    (entry) => str(entry, 'status') === 'PUBLISHED' && !entry.deletedAt && str(entry, 'id') && str(entry, 'primarySlug'),
  );
  for (const entry of publishedEntries) entryById.set(str(entry, 'id') as string, entry);

  const variantsByEntry = new Map<string, string[]>();
  for (const variant of variants) {
    const entryId = str(variant, 'entryId');
    const text = str(variant, 'variantText');
    if (!entryId || !text) continue;
    const list = variantsByEntry.get(entryId) ?? [];
    list.push(text);
    variantsByEntry.set(entryId, list);
  }

  const tagsByEntry = new Map<string, string[]>();
  for (const link of entryTags) {
    const entryId = str(link, 'entryId');
    const tagSlug = tagSlugById.get(str(link, 'tagId') ?? '');
    if (!entryId || !tagSlug) continue;
    const list = tagsByEntry.get(entryId) ?? [];
    list.push(tagSlug);
    tagsByEntry.set(entryId, list);
  }

  const examplesBySense = new Map<string, Row[]>();
  for (const example of senseExamples) {
    const senseId = str(example, 'senseId');
    if (!senseId) continue;
    const list = examplesBySense.get(senseId) ?? [];
    list.push(example);
    examplesBySense.set(senseId, list);
  }

  for (const sense of senses) {
    if (str(sense, 'status') !== 'PUBLISHED' || sense.deletedAt) continue;
    const senseId = str(sense, 'id');
    const entry = entryById.get(str(sense, 'entryId') ?? '');
    if (!senseId || !entry) continue;
    const entrySlug = str(entry, 'primarySlug') as string;
    const entryType = str(entry, 'entryType') === 'ACRONYM' ? 'ACRONYM' : 'TERM';
    const entryKeyStr = `${entryType}:${entrySlug}`;

    const provenanceRows = provenanceBySense.get(senseId) ?? [];
    const citationRow = provenanceRows
      .map((row) => citationById.get(str(row, 'citationId') ?? ''))
      .find((row): row is Row => row !== undefined);
    const documentRow = citationRow ? documentById.get(str(citationRow, 'sourceDocumentId') ?? '') : undefined;
    const sourceSlug = citationRow ? sourceSlugById.get(str(citationRow, 'sourceId') ?? '') : undefined;

    if (!citationRow || !documentRow || !sourceSlug) {
      const acc = editorialOverrides.get(entryKeyStr) ?? { ...entry, editorial: [] };
      acc.editorial.push(sense);
      editorialOverrides.set(entryKeyStr, acc);
      if (sense.isEditorial !== true) {
        report.push(`sense ${senseId} (${entryKeyStr}): no resolvable citation; carried over as editorial sense`);
      }
      continue;
    }

    const bundle = bundles.get(sourceSlug) ?? { documents: new Map(), entries: new Map() };
    bundles.set(sourceSlug, bundle);
    bundle.documents.set(str(documentRow, 'id') as string, documentRow);
    const acc = bundle.entries.get(entryKeyStr) ?? { entry, senses: [] };
    acc.senses.push({ sense, citation: citationRow, document: documentRow });
    bundle.entries.set(entryKeyStr, acc);
  }

  for (const [sourceSlug, acc] of [...bundles.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const documents = [...acc.documents.values()].map((doc) => ({
      key: str(doc, 'id') as string,
      url: str(doc, 'url') ?? 'https://invalid.example/missing-url',
      title: str(doc, 'title'),
      contentType: str(doc, 'contentType') ?? 'text/html',
      contentSha256: /^[a-f0-9]{64}$/.test(str(doc, 'contentSha256') ?? '') ? (str(doc, 'contentSha256') as string) : '0'.repeat(64),
      fetchedAt: isoDateTime(num(doc, 'fetchedAt'), nowIso),
    }));
    const bundleEntries = [...acc.entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { entry, senses: senseRows }]) => {
        const entryId = str(entry, 'id') as string;
        return {
          entryType: str(entry, 'entryType') === 'ACRONYM' ? 'ACRONYM' : 'TERM',
          slug: str(entry, 'primarySlug') as string,
          title: str(entry, 'displayTitle') ?? (str(entry, 'primarySlug') as string),
          aliases: [...new Set(variantsByEntry.get(entryId) ?? [])],
          tags: [...new Set(tagsByEntry.get(entryId) ?? [])].sort(),
          ...(str(entry, 'summaryMd') ? { summaryMd: str(entry, 'summaryMd') } : {}),
          updatedAt: isoDate(num(entry, 'updatedAt') ?? num(entry, 'publishedAt'), today),
          senses: senseRows
            .sort((a, b) => (num(a.sense, 'senseOrder') ?? 0) - (num(b.sense, 'senseOrder') ?? 0))
            .map(({ sense, citation }) => ({
              key: str(sense, 'id') as string,
              ...(str(sense, 'senseLabel') ? { label: str(sense, 'senseLabel') } : {}),
              definitionMd: str(sense, 'definitionMd') ?? str(sense, 'definitionText') ?? 'REVIEW REQUIRED',
              ...(str(sense, 'expandedForm') ? { expandedForm: str(sense, 'expandedForm') } : {}),
              examples: (examplesBySense.get(str(sense, 'id') as string) ?? [])
                .sort((a, b) => (num(a, 'exampleOrder') ?? 0) - (num(b, 'exampleOrder') ?? 0))
                .map((example) => str(example, 'exampleMd') ?? str(example, 'exampleText') ?? '')
                .filter((text) => text.length > 0),
              citation: {
                documentKey: str(citation, 'sourceDocumentId') as string,
                ...(str(citation, 'citationText') ? { citationText: str(citation, 'citationText') } : {}),
              },
            })),
          relationships: [] as Array<{ toType: string; toSlug: string; type: string }>,
        };
      });
    files.set(`generated/${sourceSlug}.json`, {
      schemaVersion: 1,
      source: sourceSlug,
      generatedAt: nowIso,
      adapterVersion: 'bootstrap-1',
      documents,
      entries: bundleEntries,
    });
  }

  // --- relationships: group per from-entry, then attach to whichever bundle owns that entry ---
  const keyFor = (entryId: string): string | undefined => {
    const entry = entryById.get(entryId);
    if (!entry) return undefined;
    return `${str(entry, 'entryType') === 'ACRONYM' ? 'ACRONYM' : 'TERM'}:${str(entry, 'primarySlug')}`;
  };
  const relsByFrom = new Map<string, Array<{ toType: string; toSlug: string; type: string }>>();
  for (const rel of relationships) {
    if (rel.deletedAt) continue;
    const fromKey = keyFor(str(rel, 'fromEntryId') ?? '');
    const toKey = keyFor(str(rel, 'toEntryId') ?? '');
    if (!fromKey || !toKey) continue;
    const [toType, toSlug] = toKey.split(':') as [string, string];
    const type = ['RELATED', 'SEE_ALSO', 'CONTRAST'].includes(str(rel, 'relationshipType') ?? '')
      ? (str(rel, 'relationshipType') as string)
      : 'RELATED';
    const list = relsByFrom.get(fromKey) ?? [];
    if (!list.some((existing) => existing.toSlug === toSlug && existing.toType === toType && existing.type === type)) {
      list.push({ toType, toSlug, type });
    }
    relsByFrom.set(fromKey, list);
  }
  for (const [filePath, file] of files) {
    if (!filePath.startsWith('generated/')) continue;
    const bundle = file as { entries: Array<{ entryType: string; slug: string; relationships: unknown[] }> };
    for (const entry of bundle.entries) {
      const rels = relsByFrom.get(`${entry.entryType}:${entry.slug}`);
      if (rels) {
        entry.relationships = rels;
        relsByFrom.delete(`${entry.entryType}:${entry.slug}`);
      }
    }
  }
  for (const [fromKey, rels] of relsByFrom) {
    for (const rel of rels) {
      report.push(
        `relationship ${fromKey} -> ${rel.toType}:${rel.toSlug} (${rel.type}): from-entry not in any bundle; add via override`,
      );
    }
  }

  // --- editorial-only senses/entries -> overrides ---
  for (const [entryKeyStr, acc] of editorialOverrides) {
    const [entryType, slug] = entryKeyStr.split(':') as [string, string];
    const dir = entryType === 'ACRONYM' ? 'acronym' : 'term';
    const inSomeBundle = [...bundles.values()].some((bundle) => bundle.entries.has(entryKeyStr));
    files.set(`overrides/${dir}/${slug}.json`, {
      ...(inSomeBundle
        ? {}
        : {
            title: str(acc, 'displayTitle') ?? slug,
            updatedAt: isoDate(num(acc, 'updatedAt') ?? num(acc, 'publishedAt'), today),
          }),
      ...(str(acc, 'editorialNotes') ? { editorialNotes: str(acc, 'editorialNotes') } : {}),
      editorialSenses: acc.editorial
        .sort((a, b) => (num(a, 'senseOrder') ?? 0) - (num(b, 'senseOrder') ?? 0))
        .map((sense) => ({
          ...(str(sense, 'senseLabel') ? { label: str(sense, 'senseLabel') } : {}),
          definitionMd: str(sense, 'definitionMd') ?? str(sense, 'definitionText') ?? 'REVIEW REQUIRED',
          rationale: str(sense, 'editorialRationale') ?? 'Carried over from the pre-GitOps database.',
          examples: (examplesBySense.get(str(sense, 'id') as string) ?? [])
            .sort((a, b) => (num(a, 'exampleOrder') ?? 0) - (num(b, 'exampleOrder') ?? 0))
            .map((example) => str(example, 'exampleMd') ?? str(example, 'exampleText') ?? '')
            .filter((text) => text.length > 0),
        })),
    });
  }

  // --- slug history -> redirects ---
  const redirects: Array<{ entryType: string; fromSlug: string; toSlug: string }> = [];
  for (const row of slugHistory) {
    const entry = entryById.get(str(row, 'entryId') ?? '');
    const fromSlug = str(row, 'slug');
    if (!entry || !fromSlug) continue;
    const entryType = str(entry, 'entryType') === 'ACRONYM' ? 'ACRONYM' : 'TERM';
    const toSlug = str(entry, 'primarySlug') as string;
    if (fromSlug === toSlug) continue;
    if (!redirects.some((r) => r.entryType === entryType && r.fromSlug === fromSlug)) {
      redirects.push({ entryType, fromSlug, toSlug });
    }
  }
  files.set('redirects.json', {
    redirects: redirects.sort((a, b) => a.entryType.localeCompare(b.entryType) || a.fromSlug.localeCompare(b.fromSlug)),
  });

  report.push(
    `bootstrapped: ${publishedEntries.length} published entries, ${bundles.size} bundles, ` +
      `${editorialOverrides.size} override files, ${redirects.length} redirects`,
  );
  return { files, report };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  const snapshotDir = process.argv[2];
  if (!snapshotDir) {
    console.error('usage: tsx src/bootstrap-from-export.ts <extracted-snapshot-dir> [<content-dir>]');
    process.exit(1);
  }
  const contentDir = process.argv[3] ?? path.resolve(import.meta.dirname, '../../../content');
  const { files, report } = await bootstrapFromExport(snapshotDir);
  for (const [relPath, value] of files) {
    const outPath = path.join(contentDir, relPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(value, null, 2)}\n`);
  }
  for (const line of report) console.log(line);
  console.log(`wrote ${files.size} files under ${contentDir}; now run: pnpm content:check`);
}
