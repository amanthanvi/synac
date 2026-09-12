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

// Fixtures in this file always produce the element each assertion indexes, so a
// missing one means the fixture broke rather than a real runtime possibility.
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}`);
  }
  return item;
}

function makeSource(overrides: Partial<SourceFile> = {}): SourceFile {
  return {
    slug: 'rfc4949',
    name: 'RFC 4949',
    baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
    license: {
      type: 'OTHER',
      allowedUse: 'Reproduction with attribution',
      attributionRequirements: 'RFC 4949, IETF',
      contentMode: 'QUOTED',
      publicStatement: undefined,
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
  labelSenses: {},
  disambiguationNotes: {},
  groupSenses: [],
  splitSenses: [],
  editorialSenses: [],
};

describe('compileContent', () => {
  it('compiles a bundle entry with resolved citations and derived text', () => {
    const result = compileContent(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = at(result.dataset.entries, 0);
    expect(entry).toMatchObject({
      key: 'TERM:back-door',
      title: 'Back Door',
      normalizedTitle: 'back door',
      aliases: ['trapdoor'],
      tagSlugs: ['malware'],
      citedSourceSlugs: ['rfc4949'],
    });
    expect(entry.searchDocument).toContain('hidden mechanism');
    const sense = at(result.dataset.senses, 0);
    expect(sense.definitionText).toBe(
      'A hidden mechanism that bypasses normal authentication.',
    );
    expect(sense.isPreferred).toBe(true);
    expect(at(sense.citations, 0)).toMatchObject({
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
      ...at(bundle.entries, 0),
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
          ...at(makeBundle().entries, 0),
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
    expect(at(result.dataset.senses, 0).isPreferred).toBe(true);
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
    at(bundle.entries, 0).tags = ['not-a-tag'];
    at(bundle.entries, 0).relationships = [
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

    const completeTags: TagsFile = {
      taxonomyVersion: '2',
      tags: [
        {
          slug: 'malware',
          name: 'Malware',
          description: 'Malicious software.',
          definition: 'Malicious software and its behavior.',
          inclusionRules: ['Malware is substantive.'],
          exclusionRules: ['Incidental malware mentions.'],
          positiveExamples: ['one', 'two', 'three', 'four', 'five'],
          hardNegatives: ['six', 'seven', 'eight', 'nine', 'ten'],
          allowedCooccurrences: [],
          lifecycle: 'PUBLISHED',
        },
      ],
      retiredTags: [],
    };
    expect(tagsFileSchema.safeParse(completeTags).success).toBe(true);
    const thresholds = { malware: 0.98 };
    expect(
      tagAssignmentsFileSchema.safeParse({
        schemaVersion: 1,
        taxonomyVersion: '2',
        taxonomyHash: tagTaxonomyHash(completeTags),
        run: {
          runId: 'released',
          corpusHash: 'a'.repeat(64),
          model: 'test',
          modelHash: 'a'.repeat(64),
          promptHash: 'a'.repeat(64),
          configHash: 'a'.repeat(64),
          calibrationHash: 'a'.repeat(64),
          certificationHash: 'a'.repeat(64),
          thresholds,
          thresholdsHash: stableJsonHash(thresholds),
          labelOrigin: 'synthetic_ai_panel',
          createdAt: '2026-08-10T00:00:00Z',
          release: true,
        },
        assignments: [],
        removals: [],
      }).success,
    ).toBe(true);
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
    at(bundle.entries, 0).tags = [];
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
      expect(at(after.dataset.entries, 0).tagSlugs).toEqual(
        at(before.dataset.entries, 0).tagSlugs,
      );
      expect(after.dataset.contentVersion).not.toBe(
        before.dataset.contentVersion,
      );
    }
  });

  it('merges accepted assignments before authoritative manual add/remove overrides', () => {
    const bundle = makeBundle();
    at(bundle.entries, 0).tags = [];
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
    const entry = at(baseline.dataset.entries, 0);
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
    expect(at(result.dataset.entries, 0).tagSlugs).toEqual([
      'incident-response',
    ]);
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
      expect(at(provenanceOnly.dataset.entries, 0).tagSlugs).toEqual(
        at(result.dataset.entries, 0).tagSlugs,
      );
      expect(provenanceOnly.dataset.contentVersion).not.toBe(
        result.dataset.contentVersion,
      );
    }
  });

  it('rejects raw bundle tags under taxonomy v2', () => {
    const bundle = makeBundle();
    at(bundle.entries, 0).tags = ['malware'];
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
    at(bundle.entries, 0).tags = [];
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

  it('validates retired replacements and reviewed removal integrity', () => {
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [
        { slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' },
        { slug: 'future-tag', name: 'Future', lifecycle: 'CANDIDATE' },
      ],
      retiredTags: [
        {
          slug: 'old-tag',
          name: 'Old',
          replacedBy: 'future-tag',
          reason: 'Candidate replacement is not serving-ready.',
        },
      ],
    };
    const thresholds = { malware: 0.98 };
    const tagAssignments: TagAssignmentsFile = {
      schemaVersion: 1,
      taxonomyVersion: '2',
      taxonomyHash: tagTaxonomyHash(tags),
      run: {
        runId: 'removal-test',
        corpusHash: classificationCorpusHash([], []),
        model: 'test-model',
        modelHash: 'a'.repeat(64),
        promptHash: 'b'.repeat(64),
        configHash: 'c'.repeat(64),
        calibrationHash: 'd'.repeat(64),
        certificationHash: 'e'.repeat(64),
        thresholds,
        thresholdsHash: stableJsonHash(thresholds),
        labelOrigin: 'synthetic_ai_panel',
        createdAt: '2026-08-10T00:00:00Z',
        release: true,
      },
      assignments: [],
      removals: [
        {
          entryKey: 'TERM:alpha',
          tagSlug: 'old-tag',
          previousEntryContentHash: 'f'.repeat(64),
          reason: 'Reviewed retirement.',
          runId: 'removal-test',
        },
        {
          entryKey: 'TERM:alpha',
          tagSlug: 'old-tag',
          previousEntryContentHash: 'f'.repeat(64),
          reason: 'Duplicate reviewed retirement.',
          runId: 'removal-test',
        },
        {
          entryKey: 'TERM:beta',
          tagSlug: 'unknown-tag',
          previousEntryContentHash: 'f'.repeat(64),
          reason: 'Unknown tag.',
          runId: 'foreign',
        },
      ],
    };
    const result = compileContent(
      makeInput({ tags, bundles: [], tagAssignments }),
      { allowUnreleasedTagging: true },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      'retired tag old-tag: replacement future-tag is not published',
    );
    expect(result.errors).toContain(
      'tag assignments: duplicate removal TERM:alpha -> old-tag',
    );
    expect(result.errors).toContain(
      'tag assignments: removal TERM:beta -> unknown-tag has a foreign run ID',
    );
    expect(result.errors).toContain(
      'tag assignments: removal TERM:beta references unknown tag unknown-tag',
    );
    expect(result.errors).toContain(
      'tag assignments: removals require previousAssignmentsHash',
    );
    expect(
      result.errors.some((error) =>
        error.includes('removal TERM:alpha references unknown tag old-tag'),
      ),
    ).toBe(false);
  });

  it('hard-fails stale, duplicate, foreign-run, unknown-entry, and non-published assignments', () => {
    const bundle = makeBundle();
    at(bundle.entries, 0).tags = [];
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
    at(bundle.entries, 0).tags = [];
    for (const suffix of ['two', 'three', 'four']) {
      bundle.entries.push({
        ...at(bundle.entries, 0),
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
    const entry = at(baseline.dataset.entries, 0);
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

const BASE_DEFINITION =
  'A **hidden** mechanism that bypasses normal authentication.';
const NEAR_DUPLICATE =
  'A hidden mechanism that bypasses normal authentication controls.';
const RELATED_DEFINITION = 'A hidden mechanism that skips login checks.';

/** The same entry contributed by a TIER1 and a TIER2 source. */
function twoSourceInput(
  secondDefinition: string,
  override?: Partial<OverrideFile>,
): ContentInput {
  const second = makeBundle({
    source: 'niccs-glossary',
    documents: [
      {
        key: 'doc-2',
        url: 'https://niccs.cisa.gov/vocabulary',
        title: 'NICCS Vocabulary',
        contentType: 'text/html',
        contentSha256: 'b'.repeat(64),
        fetchedAt: '2026-07-02T00:00:00Z',
      },
    ],
    entries: [
      {
        entryType: 'TERM',
        slug: 'back-door',
        title: 'Back Door',
        aliases: [],
        tags: [],
        summaryMd: undefined,
        updatedAt: '2026-06-02',
        senses: [
          {
            key: 's1',
            label: undefined,
            definitionMd: secondDefinition,
            expandedForm: undefined,
            examples: [],
            citation: {
              documentKey: 'doc-2',
              citationText: undefined,
              locator: undefined,
            },
          },
        ],
        relationships: [],
      },
    ],
  });
  return makeInput({
    sources: [
      makeSource(),
      makeSource({
        slug: 'niccs-glossary',
        name: 'NICCS Vocabulary',
        trustTier: 'TIER2',
        license: {
          type: 'US_GOV_PD',
          url: 'https://www.dhs.gov/website-policies',
          notes: 'U.S. Government work.',
          publicStatement: 'Public domain (U.S. Government work).',
          contentMode: 'QUOTED',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'NICCS, CISA',
        },
      }),
    ],
    bundles: [makeBundle(), second],
    overrides: override
      ? new Map([['TERM:back-door', { ...emptyOverride, ...override }]])
      : new Map(),
  });
}

describe('sense attestations', () => {
  it('merges near-duplicate definitions into one sense with both citations', () => {
    const result = compileContent(twoSourceInput(NEAR_DUPLICATE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.senses).toHaveLength(1);
    const sense = at(result.dataset.senses, 0);
    expect(sense.key).toBe('rfc4949:s1');
    // The sense itself carries the primary source's wording, so only the
    // further sources appear as attestations.
    expect(sense.attestations.map((a) => a.key)).toEqual(['niccs-glossary:s1']);
    expect(at(sense.attestations, 0).definitionText).toBe(
      'A hidden mechanism that bypasses normal authentication controls.',
    );
    expect(sense.citations.map((c) => c.sourceSlug)).toEqual([
      'rfc4949',
      'niccs-glossary',
    ]);
    expect(sense.labelFallback).toBe('RFC 4949');
    expect(sense.needsLabel).toBe(false);
  });

  it('keeps merely similar definitions apart and asks for labels', () => {
    const result = compileContent(twoSourceInput(RELATED_DEFINITION));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.senses).toHaveLength(2);
    expect(result.dataset.senses.every((sense) => sense.needsLabel)).toBe(true);
    expect(
      result.warnings.some((warning) =>
        warning.startsWith(
          'entry TERM:back-door: senses rfc4949:s1, niccs-glossary:s1 need labels (similarity 0.57); ' +
            'add labelSenses in content/overrides/term/back-door.json',
        ),
      ),
    ).toBe(true);
  });

  it('honours groupSenses, splitSenses, labelSenses, and disambiguationNotes', () => {
    const merged = compileContent(
      twoSourceInput(RELATED_DEFINITION, {
        groupSenses: [['niccs-glossary:s1', 'rfc4949:s1']],
      }),
    );
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.dataset.senses).toHaveLength(1);
    expect(at(merged.dataset.senses, 0).key).toBe('niccs-glossary:s1');

    const split = compileContent(
      twoSourceInput(NEAR_DUPLICATE, { splitSenses: ['niccs-glossary:s1'] }),
    );
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.dataset.senses).toHaveLength(2);

    const labelled = compileContent(
      twoSourceInput(RELATED_DEFINITION, {
        labelSenses: {
          'rfc4949:s1': 'Authentication bypass',
          'niccs-glossary:s1': 'Login bypass',
        },
        disambiguationNotes: { 'rfc4949:s1': 'Protocol wording.' },
      }),
    );
    expect(labelled.ok).toBe(true);
    if (!labelled.ok) return;
    expect(labelled.dataset.senses.map((sense) => sense.label)).toEqual([
      'Authentication bypass',
      'Login bypass',
    ]);
    expect(labelled.dataset.senses.every((sense) => sense.needsLabel)).toBe(
      false,
    );
    expect(at(labelled.dataset.senses, 0).disambiguationNote).toBe(
      'Protocol wording.',
    );
    expect(at(labelled.dataset.senses, 0).normalizedLabel).toBe(
      'authentication bypass',
    );
    expect(at(labelled.dataset.entries, 0).senseSummary).toBe(
      'Authentication bypass · Login bypass',
    );
  });

  it('keeps a reviewed group primary as a leader when it resembles an earlier sense', () => {
    // rfc4949 leads by trust tier; niccs-glossary is the reviewed primary of a
    // group with a third source but is near-identical to rfc4949's wording.
    const input = twoSourceInput(NEAR_DUPLICATE, {
      groupSenses: [['niccs-glossary:s1', 'mitre-attack-cti:s1']],
    });
    input.sources.push(
      makeSource({
        slug: 'mitre-attack-cti',
        name: 'MITRE ATT&CK',
        trustTier: 'TIER2',
      }),
    );
    const niccs = at(input.bundles, 1);
    input.bundles.push({
      ...niccs,
      source: 'mitre-attack-cti',
      entries: niccs.entries.map((entry) => ({
        ...entry,
        senses: entry.senses.map((sense) => ({
          ...sense,
          definitionMd: RELATED_DEFINITION,
        })),
      })),
    });

    const result = compileContent(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.senses.map((sense) => sense.key)).toEqual([
      'rfc4949:s1',
      'niccs-glossary:s1',
    ]);
    // The third source survives as the group's attestation instead of vanishing.
    expect(at(result.dataset.senses, 1).attestations.map((a) => a.key)).toEqual(
      ['mitre-attack-cti:s1'],
    );
  });

  it('rejects bundle senses from a source that declares a summarized mode', () => {
    const source = makeSource();
    const result = compileContent(
      makeInput({
        sources: [
          makeSource({
            license: { ...source.license, contentMode: 'SUMMARIZED' },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      'bundle rfc4949: source declares contentMode SUMMARIZED but bundle senses carry source wording; write summarized senses in content/overrides/ instead',
    );
  });

  it('rejects override sense keys that match nothing', () => {
    const result = compileContent(
      twoSourceInput(RELATED_DEFINITION, {
        labelSenses: { 'rfc4949:missing': 'Nope' },
        splitSenses: ['rfc4949:s1'],
        groupSenses: [['rfc4949:s1', 'niccs-glossary:s1']],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      'override TERM:back-door: labelSenses key rfc4949:missing matches no sense',
    );
    expect(result.errors).toContain(
      'override TERM:back-door: sense rfc4949:s1 is in both groupSenses and splitSenses',
    );
  });
});

describe('entry presentation fields', () => {
  it('drops a derived summary that repeats the first sense and keeps an override summary', () => {
    const bundle = makeBundle();
    at(bundle.entries, 0).summaryMd = BASE_DEFINITION;
    const derived = compileContent(makeInput({ bundles: [bundle] }));
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(at(derived.dataset.entries, 0).summaryMd).toBeUndefined();
    expect(at(derived.dataset.entries, 0).summaryText).toBeUndefined();
    expect(at(derived.dataset.entries, 0).snippetText).toBe(
      'A hidden mechanism that bypasses normal authentication.',
    );

    const overridden = compileContent(
      makeInput({
        bundles: [bundle],
        overrides: new Map([
          ['TERM:back-door', { ...emptyOverride, summaryMd: BASE_DEFINITION }],
        ]),
      }),
    );
    expect(overridden.ok).toBe(true);
    if (!overridden.ok) return;
    expect(at(overridden.dataset.entries, 0).summaryMd).toBe(BASE_DEFINITION);
  });

  it('carries license provenance and the document digest on every citation', () => {
    const result = compileContent(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(at(at(result.dataset.senses, 0).citations, 0)).toMatchObject({
      contentMode: 'QUOTED',
      documentSha256: 'a'.repeat(64),
      licenseUrl: undefined,
      publicStatement: undefined,
    });
    expect(result.dataset.sources[0]).toMatchObject({
      contentMode: 'QUOTED',
      publicStatement: undefined,
    });
  });

  it('records tag provenance and counts each lane', () => {
    const result = compileContent(
      makeInput({
        overrides: new Map([
          ['TERM:back-door', { ...emptyOverride, addTags: ['malware'] }],
        ]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(at(result.dataset.entries, 0).tags).toEqual([
      { slug: 'malware', assignedBy: 'EDITORIAL', score: undefined },
    ]);
    expect(result.dataset.tags[0]).toMatchObject({
      entryCount: 1,
      editorialCount: 1,
      autoCount: 0,
    });
  });

  it('collects aliases and expansions into matchTerms', () => {
    const bundle = makeBundle();
    at(at(bundle.entries, 0).senses, 0).expandedForm = 'Maintenance Hook';
    const result = compileContent(makeInput({ bundles: [bundle] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(at(result.dataset.entries, 0).matchTerms).toEqual([
      'trapdoor',
      'maintenance hook',
    ]);
  });
});
