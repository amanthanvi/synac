import { describe, expect, it } from 'vitest';

import { compileContent, entryKey, type ContentInput } from './compile.js';
import {
  tagAssignmentsFileSchema,
  tagsFileSchema,
  type BundleFile,
  type OverrideFile,
  type SourceFile,
  type TagAssignmentsFile,
  type TagsFile,
} from './model.js';
import {
  classificationCorpusHash,
  classificationEntryHash,
  stableJsonHash,
  tagTaxonomyHash,
} from './tagging.js';

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
            definitionMd:
              'A **hidden** mechanism that bypasses normal authentication.',
            expandedForm: undefined,
            examples: ['Firmware back doors survive reinstallation.'],
            citation: {
              documentKey: 'doc-1',
              citationText: 'RFC 4949 §back door',
              locator: undefined,
            },
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
    expect(sense.definitionText).toBe(
      'A hidden mechanism that bypasses normal authentication.',
    );
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
    expect(
      a.ok && b.ok && a.dataset.contentVersion === b.dataset.contentVersion,
    ).toBe(true);
  });

  it('skips content from disabled sources with a warning', () => {
    const result = compileContent(
      makeInput({ sources: [makeSource({ enabled: false })] }),
    );
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
      relationships: [
        { toType: 'TERM', toSlug: 'back-door', type: 'SEE_ALSO' },
      ],
    });
    const overrides = new Map([
      [
        entryKey('TERM', 'back-door'),
        {
          ...emptyOverride,
          suppress: { reason: 'takedown', reference: undefined },
        },
      ],
    ]);
    const result = compileContent(makeInput({ bundles: [bundle], overrides }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.entries.map((e) => e.key)).toEqual([
      'TERM:related-term',
    ]);
    expect(result.dataset.relationships).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('suppressed entry'))).toBe(
      true,
    );
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
              citation: {
                documentKey: 'doc-1',
                citationText: undefined,
                locator: undefined,
              },
            },
          ],
        },
      ],
    });
    const overrides = new Map([
      [
        entryKey('TERM', 'back-door'),
        { ...emptyOverride, preferredSense: 'niccs-glossary:n1' },
      ],
    ]);
    const result = compileContent(
      makeInput({
        sources: [
          makeSource(),
          makeSource({
            slug: 'niccs-glossary',
            name: 'NICCS',
            trustTier: 'TIER2',
          }),
        ],
        bundles: [makeBundle(), tier2],
        overrides,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.senses.map((s) => s.key)).toEqual([
      'niccs-glossary:n1',
      'rfc4949:s1',
    ]);
    expect(result.dataset.senses[0].isPreferred).toBe(true);
  });

  it('creates editorial-only entries and rejects orphan overrides', () => {
    const editorial: OverrideFile = {
      ...emptyOverride,
      title: 'Purple Team',
      updatedAt: '2026-05-01',
      editorialSenses: [
        {
          label: undefined,
          definitionMd: 'A blended red/blue exercise.',
          expandedForm: undefined,
          rationale: 'No source covers this yet.',
          examples: [],
        },
      ],
    };
    const good = compileContent(
      makeInput({
        overrides: new Map([[entryKey('TERM', 'purple-team'), editorial]]),
      }),
    );
    expect(good.ok).toBe(true);
    if (good.ok) {
      const entry = good.dataset.entries.find(
        (e) => e.key === 'TERM:purple-team',
      );
      expect(entry?.updatedAt).toBe(Date.parse('2026-05-01T00:00:00Z'));
      const sense = good.dataset.senses.find(
        (s) => s.entryKey === 'TERM:purple-team',
      );
      expect(sense).toMatchObject({
        isEditorial: true,
        editorialRationale: 'No source covers this yet.',
      });
    }

    const orphan = compileContent(
      makeInput({
        overrides: new Map([
          [
            entryKey('TERM', 'nonexistent'),
            { ...emptyOverride, addTags: ['malware'] },
          ],
        ]),
      }),
    );
    expect(orphan.ok).toBe(false);
  });

  it('fails on referential errors: unknown tags, unknown relationship targets, bad redirects', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = ['not-a-tag'];
    bundle.entries[0].relationships = [
      { toType: 'TERM', toSlug: 'missing', type: 'RELATED' },
    ];
    const result = compileContent(
      makeInput({
        bundles: [bundle],
        redirects: {
          redirects: [
            {
              entryType: 'TERM',
              fromSlug: 'back-door',
              toSlug: 'missing-target',
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('unknown tag not-a-tag'))).toBe(
      true,
    );
    expect(
      result.errors.some((e) =>
        e.includes('relates to unknown entry TERM:missing'),
      ),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes('target does not exist'))).toBe(
      true,
    );
    expect(
      result.errors.some((e) => e.includes('source slug is a live entry')),
    ).toBe(true);
  });

  it('fails when license terms are blank', () => {
    const source = makeSource();
    source.license.allowedUse = '  ';
    const result = compileContent(makeInput({ sources: [source] }));
    expect(result.ok).toBe(false);
  });

  it('requires complete taxonomy-v2 contracts and release-only serving artifacts', () => {
    expect(
      tagsFileSchema.safeParse({
        taxonomyVersion: '2',
        tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
        retiredTags: [],
      }).success,
    ).toBe(false);
    expect(
      tagAssignmentsFileSchema.safeParse({
        schemaVersion: 1,
        taxonomyVersion: '2',
        taxonomyHash: 'a'.repeat(64),
        run: {
          runId: 'unreleased',
          corpusHash: 'a'.repeat(64),
          model: 'test',
          modelHash: 'a'.repeat(64),
          promptHash: 'a'.repeat(64),
          configHash: 'a'.repeat(64),
          calibrationHash: 'a'.repeat(64),
          certificationHash: 'a'.repeat(64),
          thresholds: { malware: 0.98 },
          thresholdsHash: stableJsonHash({ malware: 0.98 }),
          labelOrigin: 'synthetic_ai_panel',
          createdAt: '2026-08-10T00:00:00Z',
          release: false,
        },
        assignments: [],
        removals: [],
      }).success,
    ).toBe(false);
  });

  it('fails closed when taxonomy v2 publishes tags without an assignment artifact', () => {
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
      retiredTags: [],
    };
    const result = compileContent(makeInput({ tags }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      'taxonomy v2: published tags require content/tag-assignments.json',
    );

    const bundle = makeBundle();
    bundle.entries[0].tags = [];
    const before = compileContent(makeInput({ tags, bundles: [bundle] }), {
      allowUnreleasedTagging: true,
    });
    const after = compileContent(
      makeInput({
        tags: {
          ...tags,
          tags: tags.tags.map((tag) => ({
            ...tag,
            description: 'Changed contract provenance only.',
          })),
        },
        bundles: [bundle],
      }),
      { allowUnreleasedTagging: true },
    );
    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    if (before.ok && after.ok) {
      expect(after.dataset.entries[0].tagSlugs).toEqual(
        before.dataset.entries[0].tagSlugs,
      );
      expect(after.dataset.contentVersion).not.toBe(
        before.dataset.contentVersion,
      );
    }
  });

  it('merges accepted assignments before authoritative manual add/remove overrides', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = [];
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [
        { slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' },
        {
          slug: 'incident-response',
          name: 'Incident response',
          lifecycle: 'PUBLISHED',
        },
      ],
      retiredTags: [],
    };
    const baseline = compileContent(makeInput({ tags, bundles: [bundle] }), {
      allowUnreleasedTagging: true,
    });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const entry = baseline.dataset.entries[0];
    const entryHash = classificationEntryHash(
      entry,
      baseline.dataset.senses.filter((sense) => sense.entryKey === entry.key),
    );
    const runId = 'test-run';
    const tagAssignments: TagAssignmentsFile = {
      schemaVersion: 1,
      taxonomyVersion: '2',
      taxonomyHash: tagTaxonomyHash(tags),
      run: {
        runId,
        corpusHash: classificationCorpusHash(
          baseline.dataset.entries,
          baseline.dataset.senses,
        ),
        model: 'test-model',
        modelHash: 'b'.repeat(64),
        promptHash: 'c'.repeat(64),
        configHash: 'd'.repeat(64),
        calibrationHash: 'e'.repeat(64),
        certificationHash: 'f'.repeat(64),
        thresholds: { malware: 0.98, 'incident-response': 0.98 },
        thresholdsHash: stableJsonHash({
          malware: 0.98,
          'incident-response': 0.98,
        }),
        labelOrigin: 'synthetic_ai_panel',
        createdAt: '2026-08-10T00:00:00Z',
        release: true,
      },
      assignments: [
        {
          entryKey: entry.key,
          entryContentHash: entryHash,
          tagSlug: 'malware',
          authority: 'SYNTHETIC_REFERENCE',
          lane: 'AUTO',
          score: 0.99,
          runId,
        },
      ],
      removals: [],
    };
    const overrides = new Map([
      [
        entry.key,
        {
          ...emptyOverride,
          addTags: ['incident-response'],
          removeTags: ['malware'],
        },
      ],
    ]);
    const result = compileContent(
      makeInput({ tags, tagAssignments, bundles: [bundle], overrides }),
      {
        allowUnreleasedTagging: true,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.entries[0].tagSlugs).toEqual(['incident-response']);
    expect(result.dataset.contentVersion).not.toBe(
      baseline.dataset.contentVersion,
    );

    const lowScore = compileContent(
      makeInput({
        tags,
        bundles: [bundle],
        overrides,
        tagAssignments: {
          ...tagAssignments,
          assignments: tagAssignments.assignments.map((assignment) => ({
            ...assignment,
            score: 0.97,
          })),
        },
      }),
      { allowUnreleasedTagging: true },
    );
    expect(lowScore.ok).toBe(false);
    if (!lowScore.ok) {
      expect(
        lowScore.errors.some((error) =>
          error.includes('is below AUTO threshold 0.98'),
        ),
      ).toBe(true);
    }

    const provenanceOnly = compileContent(
      makeInput({
        tags,
        bundles: [bundle],
        overrides,
        tagAssignments: {
          ...tagAssignments,
          run: { ...tagAssignments.run, modelHash: '1'.repeat(64) },
        },
      }),
      { allowUnreleasedTagging: true },
    );
    expect(provenanceOnly.ok).toBe(true);
    if (provenanceOnly.ok) {
      expect(provenanceOnly.dataset.entries[0].tagSlugs).toEqual(
        result.dataset.entries[0].tagSlugs,
      );
      expect(provenanceOnly.dataset.contentVersion).not.toBe(
        result.dataset.contentVersion,
      );
    }
  });

  it('rejects raw bundle tags under taxonomy v2', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = ['malware'];
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
      retiredTags: [],
    };
    const result = compileContent(makeInput({ tags, bundles: [bundle] }), {
      allowUnreleasedTagging: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      'bundle rfc4949: entry TERM:back-door cannot supply taxonomy-v2 tags',
    );
  });

  it('rejects stale manual removal slugs under taxonomy v2', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = [];
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
      retiredTags: [],
    };
    const overrides = new Map([
      ['TERM:back-door', { ...emptyOverride, removeTags: ['retired-tag'] }],
    ]);
    const result = compileContent(
      makeInput({ tags, bundles: [bundle], overrides }),
      { allowUnreleasedTagging: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        'override TERM:back-door: removeTags references non-published tag retired-tag',
      );
    }
  });

  it('hard-fails stale, duplicate, foreign-run, unknown-entry, and non-published assignments', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = [];
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [
        { slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' },
        {
          slug: 'incident-response',
          name: 'Incident response',
          lifecycle: 'CANDIDATE',
        },
      ],
      retiredTags: [],
    };
    const row = {
      entryKey: 'TERM:back-door' as const,
      entryContentHash: '0'.repeat(64),
      tagSlug: 'malware',
      authority: 'SYNTHETIC_REFERENCE' as const,
      lane: 'AUTO' as const,
      score: 0.99,
      runId: 'foreign',
    };
    const tagAssignments: TagAssignmentsFile = {
      schemaVersion: 1,
      taxonomyVersion: '2',
      taxonomyHash: tagTaxonomyHash(tags),
      run: {
        runId: 'expected',
        corpusHash: 'a'.repeat(64),
        model: 'test-model',
        modelHash: 'b'.repeat(64),
        promptHash: 'c'.repeat(64),
        configHash: 'd'.repeat(64),
        calibrationHash: 'e'.repeat(64),
        certificationHash: 'f'.repeat(64),
        thresholds: { malware: 0.98 },
        thresholdsHash: stableJsonHash({ malware: 0.98 }),
        labelOrigin: 'synthetic_ai_panel',
        createdAt: '2026-08-10T00:00:00Z',
        release: true,
      },
      assignments: [
        row,
        { ...row },
        { ...row, entryKey: 'TERM:missing', runId: 'expected' },
        { ...row, tagSlug: 'incident-response', runId: 'expected' },
      ],
      removals: [],
    };
    const result = compileContent(
      makeInput({ tags, bundles: [bundle], tagAssignments }),
      {
        allowUnreleasedTagging: true,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) =>
        error.includes('duplicate TERM:back-door -> malware'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((error) => error.includes('foreign run ID')),
    ).toBe(true);
    expect(result.errors.some((error) => error.includes('is stale'))).toBe(
      true,
    );
    expect(
      result.errors.some((error) =>
        error.includes('unknown or suppressed entry TERM:missing'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((error) =>
        error.includes('non-published tag incident-response'),
      ),
    ).toBe(true);
  });

  it('enforces release coverage and per-published-tag population floors', () => {
    const bundle = makeBundle();
    bundle.entries[0].tags = [];
    for (const suffix of ['two', 'three', 'four']) {
      bundle.entries.push({
        ...bundle.entries[0],
        slug: `back-door-${suffix}`,
        title: `Back Door ${suffix}`,
      });
    }
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
      retiredTags: [],
    };
    const baseline = compileContent(makeInput({ tags, bundles: [bundle] }), {
      allowUnreleasedTagging: true,
    });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const entry = baseline.dataset.entries[0];
    const entryHash = classificationEntryHash(
      entry,
      baseline.dataset.senses.filter((sense) => sense.entryKey === entry.key),
    );
    const runId = 'release-test';
    const tagAssignments: TagAssignmentsFile = {
      schemaVersion: 1,
      taxonomyVersion: '2',
      taxonomyHash: tagTaxonomyHash(tags),
      run: {
        runId,
        corpusHash: classificationCorpusHash(
          baseline.dataset.entries,
          baseline.dataset.senses,
        ),
        model: 'test-model',
        modelHash: 'b'.repeat(64),
        promptHash: 'c'.repeat(64),
        configHash: 'd'.repeat(64),
        calibrationHash: 'e'.repeat(64),
        certificationHash: 'f'.repeat(64),
        thresholds: { malware: 0.98 },
        thresholdsHash: stableJsonHash({ malware: 0.98 }),
        labelOrigin: 'synthetic_ai_panel',
        createdAt: '2026-08-10T00:00:00Z',
        release: true,
      },
      assignments: [
        {
          entryKey: entry.key,
          entryContentHash: entryHash,
          tagSlug: 'malware',
          authority: 'SYNTHETIC_REFERENCE',
          lane: 'AUTO',
          score: 0.99,
          runId,
        },
      ],
      removals: [],
    };
    const result = compileContent(
      makeInput({ tags, bundles: [bundle], tagAssignments }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) =>
        error.includes('25.00% is below the required 30.00%'),
      ),
    ).toBe(true);
    expect(
      result.errors.some((error) =>
        error.includes('malware has 1 entries; at least 25 required'),
      ),
    ).toBe(true);
  });
});
