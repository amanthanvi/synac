import { describe, expect, it } from 'vitest';

import { compileContent, entryKey, type ContentInput } from './compile.js';
import type { BundleFile, OverrideFile, SourceFile } from './model.js';

function makeSource(overrides: Partial<SourceFile> = {}): SourceFile {
  return {
    slug: 'rfc4949',
    name: 'RFC 4949',
    baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
    license: {
      type: 'OTHER',
      allowedUse: 'Reproduction with attribution',
      attributionRequirements: 'RFC 4949, IETF',
      notes: undefined,
      url: undefined,
    },
    accessMethod: 'TEXT',
    trustTier: 'TIER1',
    enabled: true,
    ingest: undefined,
    contact: undefined,
    lastVerifiedAt: '2026-01-15',
    ...overrides,
  };
}

function makeBundle(overrides: Partial<BundleFile> = {}): BundleFile {
  return {
    schemaVersion: 1,
    source: 'rfc4949',
    generatedAt: '2026-07-01T00:00:00Z',
    adapterVersion: 'test-1',
    documents: [
      {
        key: 'doc-1',
        url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
        title: 'RFC 4949',
        contentType: 'text/plain',
        contentSha256: 'a'.repeat(64),
        fetchedAt: '2026-07-01T00:00:00Z',
      },
    ],
    entries: [
      {
        entryType: 'TERM',
        slug: 'back-door',
        title: 'Back Door',
        aliases: ['trapdoor'],
        tags: ['malware'],
        summaryMd: undefined,
        updatedAt: '2026-06-01',
        senses: [
          {
            key: 's1',
            label: undefined,
            definitionMd: 'A **hidden** mechanism that bypasses normal authentication.',
            expandedForm: undefined,
            examples: ['Firmware back doors survive reinstallation.'],
            citation: { documentKey: 'doc-1', citationText: 'RFC 4949 §back door', locator: undefined },
          },
        ],
        relationships: [],
      },
    ],
    ...overrides,
  };
}

function makeInput(overrides: Partial<ContentInput> = {}): ContentInput {
  return {
    sources: [makeSource()],
    tags: { tags: [{ slug: 'malware', name: 'Malware' }] },
    redirects: { redirects: [] },
    bundles: [makeBundle()],
    overrides: new Map(),
    ...overrides,
  };
}

const emptyOverride: OverrideFile = {
  title: undefined,
  updatedAt: undefined,
  suppress: undefined,
  summaryMd: undefined,
  editorialNotes: undefined,
  addAliases: [],
  addTags: [],
  removeTags: [],
  addRelationships: [],
  suppressSenses: [],
  preferredSense: undefined,
  editorialSenses: [],
};

describe('compileContent', () => {
  it('compiles a bundle entry with resolved citations and derived text', () => {
    const result = compileContent(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [entry] = result.dataset.entries;
    expect(entry).toMatchObject({
      key: 'TERM:back-door',
      title: 'Back Door',
      normalizedTitle: 'back door',
      aliases: ['trapdoor'],
      tagSlugs: ['malware'],
      citedSourceSlugs: ['rfc4949'],
    });
    expect(entry.searchDocument).toContain('hidden mechanism');
    const [sense] = result.dataset.senses;
    expect(sense.definitionText).toBe('A hidden mechanism that bypasses normal authentication.');
    expect(sense.isPreferred).toBe(true);
    expect(sense.citations[0]).toMatchObject({
      sourceSlug: 'rfc4949',
      url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
      attributionText: 'RFC 4949, IETF',
      accessedAt: Date.parse('2026-07-01T00:00:00Z'),
    });
  });

  it('is deterministic: same input twice yields the same contentVersion', () => {
    const a = compileContent(makeInput());
    const b = compileContent(makeInput());
    expect(a.ok && b.ok && a.dataset.contentVersion === b.dataset.contentVersion).toBe(true);
  });

  it('skips content from disabled sources with a warning', () => {
    const result = compileContent(makeInput({ sources: [makeSource({ enabled: false })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.entries).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('disabled'))).toBe(true);
  });

  it('suppresses entries via override and drops relationships pointing at them', () => {
    const bundle = makeBundle();
    bundle.entries.push({
      ...bundle.entries[0],
      slug: 'related-term',
      title: 'Related Term',
      aliases: [],
      relationships: [{ toType: 'TERM', toSlug: 'back-door', type: 'SEE_ALSO' }],
    });
    const overrides = new Map([
      [entryKey('TERM', 'back-door'), { ...emptyOverride, suppress: { reason: 'takedown', reference: undefined } }],
    ]);
    const result = compileContent(makeInput({ bundles: [bundle], overrides }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.entries.map((e) => e.key)).toEqual(['TERM:related-term']);
    expect(result.dataset.relationships).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('suppressed entry'))).toBe(true);
  });

  it('merges multi-source entries in trust-tier order and honors preferredSense', () => {
    const tier2 = makeBundle({
      source: 'niccs-glossary',
      entries: [
        {
          ...makeBundle().entries[0],
          senses: [
            {
              key: 'n1',
              label: undefined,
              definitionMd: 'NICCS wording of the definition.',
              expandedForm: undefined,
              examples: [],
              citation: { documentKey: 'doc-1', citationText: undefined, locator: undefined },
            },
          ],
        },
      ],
    });
    const overrides = new Map([
      [entryKey('TERM', 'back-door'), { ...emptyOverride, preferredSense: 'niccs-glossary:n1' }],
    ]);
    const result = compileContent(
      makeInput({
        sources: [makeSource(), makeSource({ slug: 'niccs-glossary', name: 'NICCS', trustTier: 'TIER2' })],
        bundles: [makeBundle(), tier2],
        overrides,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.senses.map((s) => s.key)).toEqual(['niccs-glossary:n1', 'rfc4949:s1']);
    expect(result.dataset.senses[0].isPreferred).toBe(true);
  });

  it('creates editorial-only entries and rejects orphan overrides', () => {
    const editorial: OverrideFile = {
      ...emptyOverride,
      title: 'Purple Team',
      updatedAt: '2026-05-01',
      editorialSenses: [
        { label: undefined, definitionMd: 'A blended red/blue exercise.', expandedForm: undefined, rationale: 'No source covers this yet.', examples: [] },
      ],
    };
    const good = compileContent(
      makeInput({ overrides: new Map([[entryKey('TERM', 'purple-team'), editorial]]) }),
    );
    expect(good.ok).toBe(true);
    if (good.ok) {
      const entry = good.dataset.entries.find((e) => e.key === 'TERM:purple-team');
      expect(entry?.updatedAt).toBe(Date.parse('2026-05-01T00:00:00Z'));
      const sense = good.dataset.senses.find((s) => s.entryKey === 'TERM:purple-team');
      expect(sense).toMatchObject({ isEditorial: true, editorialRationale: 'No source covers this yet.' });
    }

    const orphan = compileContent(
      makeInput({ overrides: new Map([[entryKey('TERM', 'nonexistent'), { ...emptyOverride, addTags: ['malware'] }]]) }),
    );
    expect(orphan.ok).toBe(false);
  });

  it('fails on referential errors: unknown tags, unknown relationship targets, bad redirects', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = ['not-a-tag'];
    bundle.entries[0].relationships = [{ toType: 'TERM', toSlug: 'missing', type: 'RELATED' }];
    const result = compileContent(
      makeInput({
        bundles: [bundle],
        redirects: { redirects: [{ entryType: 'TERM', fromSlug: 'back-door', toSlug: 'missing-target' }] },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('unknown tag not-a-tag'))).toBe(true);
    expect(result.errors.some((e) => e.includes('relates to unknown entry TERM:missing'))).toBe(true);
    expect(result.errors.some((e) => e.includes('target does not exist'))).toBe(true);
    expect(result.errors.some((e) => e.includes('source slug is a live entry'))).toBe(true);
  });

  it('fails when license terms are blank', () => {
    const source = makeSource();
    source.license.allowedUse = '  ';
    const result = compileContent(makeInput({ sources: [source] }));
    expect(result.ok).toBe(false);
  });
});
