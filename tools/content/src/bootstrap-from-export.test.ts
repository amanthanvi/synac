import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bootstrapFromExport } from './bootstrap-from-export.js';
import { compileContent, entryKey } from './compile.js';
import {
  bundleFileSchema,
  overrideFileSchema,
  redirectsFileSchema,
  sourceFileSchema,
  tagsFileSchema,
  type OverrideFile,
} from './model.js';

async function writeSnapshot(tables: Record<string, object[]>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'synac-snapshot-'));
  for (const [table, rows] of Object.entries(tables)) {
    await mkdir(path.join(dir, table), { recursive: true });
    await writeFile(path.join(dir, table, 'documents.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n'));
  }
  return dir;
}

const JULY = Date.parse('2026-07-01T00:00:00Z');

describe('bootstrapFromExport', () => {
  it('transforms a pre-cutover snapshot into content files that compile', async () => {
    const snapshotDir = await writeSnapshot({
      sources: [
        {
          id: 'src-1',
          sourceSlug: 'rfc4949',
          name: 'RFC 4949',
          baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          licenseType: 'PUBLIC_DOMAIN',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'RFC 4949 (IETF)',
          trustTier: 'TIER1',
          enabled: true,
          lastVerifiedAt: JULY,
        },
      ],
      sourceDocuments: [
        {
          id: 'doc-1',
          sourceId: 'src-1',
          url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          title: 'RFC 4949',
          contentType: 'text/plain',
          contentSha256: 'b'.repeat(64),
          fetchedAt: JULY,
        },
      ],
      citations: [
        { id: 'cit-1', sourceId: 'src-1', sourceDocumentId: 'doc-1', url: 'https://www.rfc-editor.org/rfc/rfc4949.txt', citationText: 'RFC 4949 §attack' },
      ],
      fieldProvenance: [
        { id: 'prov-1', entityType: 'SENSE', entityId: 'sense-1', fieldName: 'definitionMd', citationId: 'cit-1', contentMode: 'VERBATIM', extractionMethod: 'parse', extractorVersion: '1' },
      ],
      entries: [
        { id: 'entry-1', entryType: 'TERM', primarySlug: 'attack', displayTitle: 'Attack', normalizedTitle: 'attack', status: 'PUBLISHED', updatedAt: JULY },
        { id: 'entry-2', entryType: 'TERM', primarySlug: 'draft-entry', displayTitle: 'Draft', normalizedTitle: 'draft', status: 'DRAFT', updatedAt: JULY },
        { id: 'entry-3', entryType: 'TERM', primarySlug: 'house-rules', displayTitle: 'House Rules', normalizedTitle: 'house rules', status: 'PUBLISHED', updatedAt: JULY },
      ],
      senses: [
        { id: 'sense-1', entryId: 'entry-1', senseOrder: 0, definitionMd: 'An intentional act that attempts to violate the security policy of a system.', status: 'PUBLISHED' },
        { id: 'sense-2', entryId: 'entry-3', senseOrder: 0, definitionMd: 'An editorial definition with no source.', status: 'PUBLISHED', isEditorial: true, editorialRationale: 'House terminology.' },
      ],
      senseExamples: [{ id: 'ex-1', senseId: 'sense-1', exampleMd: 'A brute-force attack against a password.', exampleOrder: 0 }],
      entryVariants: [{ id: 'var-1', entryId: 'entry-1', variantText: 'assault', normalizedVariant: 'assault', variantType: 'SYNONYM' }],
      tags: [{ id: 'tag-1', slug: 'threat-intelligence', name: 'Threat intelligence' }],
      entryTags: [{ id: 'et-1', entryId: 'entry-1', tagId: 'tag-1' }],
      entryRelationships: [{ id: 'rel-1', fromEntryId: 'entry-1', toEntryId: 'entry-3', relationshipType: 'SEE_ALSO' }],
      entrySlugHistory: [{ id: 'hist-1', entryId: 'entry-1', entryType: 'TERM', slug: 'attack-old' }],
    });

    const { files, report } = await bootstrapFromExport(snapshotDir);

    const source = sourceFileSchema.parse(files.get('sources/rfc4949.json'));
    expect(source.ingest?.adapter).toBe('rfc4949Glossary');

    const bundle = bundleFileSchema.parse(files.get('generated/rfc4949.json'));
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.entries[0]).toMatchObject({ slug: 'attack', aliases: ['assault'], tags: ['threat-intelligence'] });
    expect(bundle.entries[0].senses[0].examples).toEqual(['A brute-force attack against a password.']);
    expect(bundle.entries[0].relationships).toEqual([{ toType: 'TERM', toSlug: 'house-rules', type: 'SEE_ALSO' }]);

    const override = overrideFileSchema.parse(files.get('overrides/term/house-rules.json'));
    expect(override.title).toBe('House Rules');
    expect(override.editorialSenses[0].rationale).toBe('House terminology.');

    const redirects = redirectsFileSchema.parse(files.get('redirects.json'));
    expect(redirects.redirects).toEqual([{ entryType: 'TERM', fromSlug: 'attack-old', toSlug: 'attack' }]);

    // The full bootstrapped output must compile cleanly.
    const overrides = new Map<string, OverrideFile>();
    for (const [filePath, value] of files) {
      const match = filePath.match(/^overrides\/(term|acronym)\/(.+)\.json$/);
      if (match) overrides.set(entryKey(match[1] === 'term' ? 'TERM' : 'ACRONYM', match[2]), overrideFileSchema.parse(value));
    }
    const compiled = compileContent({
      sources: [source],
      tags: tagsFileSchema.parse(files.get('tags.json')),
      redirects,
      bundles: [bundle],
      overrides,
    });
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(compiled.dataset.entries.map((entry) => entry.key)).toEqual(['TERM:attack', 'TERM:house-rules']);
    }

    expect(report.some((line) => line.startsWith('bootstrapped:'))).toBe(true);
  });
});
