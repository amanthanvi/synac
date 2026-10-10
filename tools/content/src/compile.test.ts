import { describe, expect, it } from 'vitest';

import { compileContent, entryKey, type ContentInput } from './compile.js';
import {
  tagAssignmentsFileSchema,
  tagsFileSchema,
  type BundleFile,
  type OverrideFile,
  type SourceFile,
  type TagAssignmentsFileV2,
  type TagsFile,
} from './model.js';
import {
  classificationEntryHashes,
  corpusHashFromEntryHashes,
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

const RELEASE_RUN_ID = 'release-test';

/** Live entry key -> classification hash, as a tagging run would see it now. */
function liveEntryHashes(input: ContentInput): Record<string, string> {
  const live = compileContent(
    { ...input, tagAssignments: undefined },
    { allowUnreleasedTagging: true },
  );
  if (!live.ok) throw new Error(live.errors.join('\n'));
  return classificationEntryHashes(
    live.classification.entries,
    live.classification.senses,
  );
}

/** A schemaVersion 2 release classified against exactly `input`. */
function releaseFor(
  input: ContentInput,
  pairs: Array<[entryKey: string, tagSlug: string]>,
  classifiedEntries: Record<string, string> = liveEntryHashes(input),
): TagAssignmentsFileV2 {
  const thresholds = Object.fromEntries(
    input.tags.tags
      .filter((tag) => (tag.lifecycle ?? 'PUBLISHED') === 'PUBLISHED')
      .map((tag) => [tag.slug, 0.98]),
  );
  return {
    schemaVersion: 2,
    taxonomyVersion: input.tags.taxonomyVersion ?? '1',
    taxonomyHash: tagTaxonomyHash(input.tags),
    run: {
      runId: RELEASE_RUN_ID,
      model: 'test-model',
      modelHash: 'b'.repeat(64),
      promptHash: 'c'.repeat(64),
      configHash: 'd'.repeat(64),
      calibrationHash: 'e'.repeat(64),
      certificationHash: 'f'.repeat(64),
      thresholds,
      thresholdsHash: stableJsonHash(thresholds),
      labelOrigin: 'synthetic_ai_panel',
      createdAt: '2026-08-10T00:00:00Z',
      release: true,
    },
    assignments: pairs.map(([key, tagSlug]) => {
      const entryContentHash = classifiedEntries[key];
      if (!entryContentHash) throw new Error(`no live entry ${key}`);
      return {
        entryKey: key,
        entryContentHash,
        tagSlug,
        authority: 'SYNTHETIC_REFERENCE',
        lane: 'AUTO',
        score: 0.99,
        runId: RELEASE_RUN_ID,
      };
    }),
    removals: [],
    classifiedEntries,
  };
}

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
        schemaVersion: 2,
        taxonomyVersion: '2',
        taxonomyHash: 'a'.repeat(64),
        run: {
          runId: 'unreleased',
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
        classifiedEntries: {},
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
    const run = {
      runId: 'released',
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
    };
    const released = {
      schemaVersion: 2,
      taxonomyVersion: '2',
      taxonomyHash: tagTaxonomyHash(completeTags),
      run,
      assignments: [],
      removals: [],
      classifiedEntries: { 'TERM:back-door': 'a'.repeat(64) },
    };
    expect(tagAssignmentsFileSchema.safeParse(released).success).toBe(true);
    // Version 2 replaces the whole-corpus hash with per-entry hashes.
    expect(
      tagAssignmentsFileSchema.safeParse({
        ...released,
        run: { ...run, corpusHash: 'a'.repeat(64) },
      }).success,
    ).toBe(false);
    expect(
      tagAssignmentsFileSchema.safeParse({
        ...released,
        classifiedEntries: undefined,
      }).success,
    ).toBe(false);
    expect(
      tagAssignmentsFileSchema.safeParse({
        ...released,
        classifiedEntries: { 'not-an-entry-key': 'a'.repeat(64) },
      }).success,
    ).toBe(false);
    // Version 1 stays readable so the history gate and migration can load it.
    expect(
      tagAssignmentsFileSchema.safeParse({
        schemaVersion: 1,
        taxonomyVersion: released.taxonomyVersion,
        taxonomyHash: released.taxonomyHash,
        run: { ...run, corpusHash: 'a'.repeat(64) },
        assignments: [],
        removals: [],
      }).success,
    ).toBe(true);
    expect(
      tagAssignmentsFileSchema.safeParse({
        schemaVersion: 1,
        taxonomyVersion: released.taxonomyVersion,
        taxonomyHash: released.taxonomyHash,
        run: { ...run, corpusHash: 'a'.repeat(64) },
        assignments: [],
        removals: [],
        classifiedEntries: released.classifiedEntries,
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
    const tagAssignments = releaseFor(makeInput({ tags, bundles: [bundle] }), [
      [entry.key, 'malware'],
    ]);
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
    const tagAssignments: TagAssignmentsFileV2 = {
      // The fixture fails compile on purpose, so it cannot supply live hashes.
      ...releaseFor(makeInput({ tags, bundles: [] }), [], {}),
      removals: [
        {
          entryKey: 'TERM:alpha',
          tagSlug: 'old-tag',
          previousEntryContentHash: 'f'.repeat(64),
          reason: 'Reviewed retirement.',
          runId: RELEASE_RUN_ID,
        },
        {
          entryKey: 'TERM:alpha',
          tagSlug: 'old-tag',
          previousEntryContentHash: 'f'.repeat(64),
          reason: 'Duplicate reviewed retirement.',
          runId: RELEASE_RUN_ID,
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

  it('hard-fails duplicate, foreign-run, unclassified, mismatched, and non-published assignments in every mode', () => {
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
    const release = releaseFor(makeInput({ tags, bundles: [bundle] }), [
      ['TERM:back-door', 'malware'],
    ]);
    const row = at(release.assignments, 0);
    const tagAssignments: TagAssignmentsFileV2 = {
      ...release,
      assignments: [
        { ...row, runId: 'foreign' },
        { ...row },
        { ...row, entryKey: 'TERM:missing' },
        { ...row, tagSlug: 'incident-response' },
        { ...row, tagSlug: 'other-hash', entryContentHash: '0'.repeat(64) },
      ],
    };
    for (const strictTagging of [false, true]) {
      const result = compileContent(
        makeInput({ tags, bundles: [bundle], tagAssignments }),
        { allowUnreleasedTagging: true, strictTagging },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'tag assignments: duplicate TERM:back-door -> malware',
          'tag assignments: TERM:back-door -> malware has a foreign run ID',
          'tag assignments: TERM:missing -> malware names an entry run release-test did not classify',
          'tag assignments: TERM:back-door references non-published tag incident-response',
          'tag assignments: TERM:back-door -> other-hash hash does not match the hash run release-test classified',
        ]),
      );
    }
  });

  it('rejects a schemaVersion 1 artifact with a migration hint', () => {
    const bundle = makeBundle();
    at(bundle.entries, 0).tags = [];
    const tags: TagsFile = {
      taxonomyVersion: '2',
      tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
      retiredTags: [],
    };
    const input = makeInput({ tags, bundles: [bundle] });
    const release = releaseFor(input, [['TERM:back-door', 'malware']]);
    const result = compileContent(
      {
        ...input,
        tagAssignments: {
          schemaVersion: 1,
          taxonomyVersion: release.taxonomyVersion,
          taxonomyHash: release.taxonomyHash,
          run: {
            ...release.run,
            corpusHash: corpusHashFromEntryHashes(release.classifiedEntries),
          },
          assignments: release.assignments,
          removals: [],
        },
      },
      { allowUnreleasedTagging: true },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'tag assignments: schemaVersion 1 binds one whole-corpus hash; run `pnpm --filter @synac/content-tools migrate:tag-assignments` to record per-entry hashes',
    ]);
  });

  it('enforces release floors in strict mode and reports them as advisory by default', () => {
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
    const input = makeInput({ tags, bundles: [bundle] });
    const released = {
      ...input,
      tagAssignments: releaseFor(input, [['TERM:back-door', 'malware']]),
    };
    const coverageFloor =
      'tag assignment release: entry coverage 25.00% is below the required 30.00%';
    const tagFloor =
      'tag assignment release: published tag malware has 1 entries; at least 25 required';

    const strict = compileContent(released, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([coverageFloor, tagFloor]);

    const lenient = compileContent(released);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([
      `${coverageFloor} (release floor; content:check:strict enforces it)`,
      `${tagFloor} (release floor; content:check:strict enforces it)`,
    ]);
  });
});

/**
 * A released corpus of 30 entries, 26 of them tagged `malware`: comfortably
 * above both release floors, so each test sees only the drift it introduces.
 */
describe('tag assignment drift', () => {
  const TAGGED = 26;
  const RUN = RELEASE_RUN_ID;
  const termSlug = (index: number): string =>
    `term-${String(index).padStart(3, '0')}`;
  const termKey = (index: number): string => `TERM:${termSlug(index)}`;
  const driftTags: TagsFile = {
    taxonomyVersion: '2',
    tags: [
      {
        slug: 'malware',
        name: 'Malware',
        lifecycle: 'PUBLISHED',
        positiveExamples: [termSlug(0)],
        hardNegatives: [termSlug(29)],
      },
    ],
    retiredTags: [],
  };
  const summary = (added: number, changed: number, removed: number): string => {
    const total = added + changed + removed;
    const subject = total === 1 ? '1 entry differs' : `${total} entries differ`;
    return (
      `tag assignments: ${subject} from run ${RUN} ` +
      `(${added} new, ${changed} changed, ${removed} removed); ` +
      'the next tagging run classifies them, and content:check:strict fails until it does'
    );
  };
  const floorSuffix = ' (release floor; content:check:strict enforces it)';

  /** Entries term-000 upward; the same index always yields the same entry. */
  function glossaryBundle(count: number): BundleFile {
    const template = at(makeBundle().entries, 0);
    const sense = at(template.senses, 0);
    return makeBundle({
      entries: Array.from({ length: count }, (_, index) => ({
        ...template,
        slug: termSlug(index),
        title: `Term ${index}`,
        aliases: [],
        tags: [],
        senses: [
          {
            ...sense,
            definitionMd: `Security concept number ${index}.`,
          },
        ],
      })),
    });
  }

  function released(): ContentInput {
    const input = makeInput({ tags: driftTags, bundles: [glossaryBundle(30)] });
    const pairs = Array.from(
      { length: TAGGED },
      (_, index): [string, string] => [termKey(index), 'malware'],
    );
    return { ...input, tagAssignments: releaseFor(input, pairs) };
  }

  function withOverride(
    input: ContentInput,
    key: string,
    override: Partial<OverrideFile>,
  ): ContentInput {
    const overrides = new Map(input.overrides);
    overrides.set(key, { ...emptyOverride, ...override });
    return { ...input, overrides };
  }

  const takedown: Partial<OverrideFile> = {
    suppress: { reason: 'takedown', reference: undefined },
  };
  const rewrite: Partial<OverrideFile> = {
    summaryMd: 'A rewritten summary that changes what the entry means.',
  };

  function tagsOf(result: ReturnType<typeof compileContent>, key: string) {
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return result.dataset.entries.find((entry) => entry.key === key)?.tags;
  }

  it('passes a current release cleanly in both modes', () => {
    const input = released();
    for (const strictTagging of [false, true]) {
      const result = compileContent(input, { strictTagging });
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
      if (!result.ok) return;
      expect(
        result.dataset.entries.filter((entry) => entry.tagSlugs.length > 0),
      ).toHaveLength(TAGGED);
    }
  });

  it('drops only the automatic tags of the edited entry, with a warning', () => {
    const edited = withOverride(released(), termKey(3), rewrite);
    const lenient = compileContent(edited);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([
      `tag assignments: ${termKey(3)} -> malware is stale: the entry changed after run ${RUN}; dropped until the next tagging run`,
      summary(0, 1, 0),
    ]);
    expect(tagsOf(lenient, termKey(3))).toEqual([]);
    expect(tagsOf(lenient, termKey(4))).toEqual([
      { slug: 'malware', assignedBy: 'AUTO', score: 0.99 },
    ]);

    const strict = compileContent(edited, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([
      `tag assignments: ${termKey(3)} -> malware is stale: the entry changed after run ${RUN}`,
      `tag assignments: ${termKey(3)} changed after run ${RUN}`,
    ]);
  });

  it('lets an editor restore a dropped tag with addTags', () => {
    const edited = withOverride(released(), termKey(3), {
      ...rewrite,
      addTags: ['malware'],
    });
    const result = compileContent(edited);
    expect(result.ok).toBe(true);
    expect(tagsOf(result, termKey(3))).toEqual([
      { slug: 'malware', assignedBy: 'EDITORIAL', score: undefined },
    ]);
  });

  it('reports an upstream text change on an untagged entry as drift', () => {
    const input = released();
    const bundle = glossaryBundle(30);
    at(at(bundle.entries, 28).senses, 0).definitionMd =
      'A definition the source rewrote.';
    const next = { ...input, bundles: [bundle] };

    const lenient = compileContent(next);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([summary(0, 1, 0)]);

    const strict = compileContent(next, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([
      `tag assignments: ${termKey(28)} changed after run ${RUN}`,
    ]);
  });

  it('never blocks a takedown, even in strict mode', () => {
    const taggedTakedown = withOverride(released(), termKey(3), takedown);
    const untaggedTakedown = withOverride(released(), termKey(27), takedown);
    for (const strictTagging of [false, true]) {
      const tagged = compileContent(taggedTakedown, { strictTagging });
      expect(tagged.ok).toBe(true);
      expect(tagged.warnings).toEqual([
        `tag assignments: ${termKey(3)} -> malware is not served because the entry is suppressed`,
      ]);
      expect(tagsOf(tagged, termKey(3))).toBeUndefined();

      const untagged = compileContent(untaggedTakedown, { strictTagging });
      expect(untagged.ok).toBe(true);
      expect(untagged.warnings).toEqual([]);
      expect(tagsOf(untagged, termKey(27))).toBeUndefined();
    }
  });

  it('passes a takedown that crosses a floor and leaves the floor to the next release', () => {
    const input = withOverride(
      withOverride(released(), termKey(3), takedown),
      termKey(4),
      takedown,
    );
    const floor =
      'tag assignment release: published tag malware has 24 entries; at least 25 required';

    const lenient = compileContent(input);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([
      `tag assignments: ${termKey(3)} -> malware is not served because the entry is suppressed`,
      `tag assignments: ${termKey(4)} -> malware is not served because the entry is suppressed`,
      `${floor}${floorSuffix}`,
    ]);

    // The floors count served entries, as the emitter does, so a release
    // after this takedown must restore the floor. The takedown is not drift.
    const strict = compileContent(input, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([floor]);
  });

  it('never blocks a takedown of a contract example', () => {
    const input = withOverride(released(), termKey(0), takedown);
    for (const strictTagging of [false, true]) {
      const result = compileContent(input, { strictTagging });
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([
        `tag assignments: ${termKey(0)} -> malware is not served because the entry is suppressed`,
        `tag malware: positive example ${termSlug(0)} is suppressed`,
      ]);
    }
  });

  it('summarizes new entries by default and lists each one in strict mode', () => {
    const next = { ...released(), bundles: [glossaryBundle(32)] };

    const lenient = compileContent(next);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([summary(2, 0, 0)]);
    expect(tagsOf(lenient, termKey(31))).toEqual([]);

    const strict = compileContent(next, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([
      `tag assignments: ${termKey(30)} is new since run ${RUN}`,
      `tag assignments: ${termKey(31)} is new since run ${RUN}`,
    ]);
  });

  it('drops the tags of an entry its source removed', () => {
    const input = released();
    const bundle = glossaryBundle(30);
    bundle.entries.splice(5, 1);
    const next = { ...input, bundles: [bundle] };

    const lenient = compileContent(next);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([
      `tag assignments: ${termKey(5)} -> malware belongs to an entry that no longer exists; dropped`,
      summary(0, 0, 1),
    ]);

    const strict = compileContent(next, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([
      `tag assignments: ${termKey(5)} -> malware belongs to an entry that no longer exists`,
      `tag assignments: ${termKey(5)} was classified by run ${RUN} but no longer exists`,
    ]);
  });

  it('reports a contract example its source removed as drift', () => {
    const input = released();
    const bundle = glossaryBundle(30);
    bundle.entries.splice(29, 1);
    const next = { ...input, bundles: [bundle] };

    const lenient = compileContent(next);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([
      summary(0, 0, 1),
      `tag malware: hard negative ${termSlug(29)} is not a live entry; replace it in the next taxonomy release`,
    ]);

    const strict = compileContent(next, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toEqual([
      `tag assignments: ${termKey(29)} was classified by run ${RUN} but no longer exists`,
      `tag malware: hard negative ${termSlug(29)} is not a live entry`,
    ]);
  });

  it('keeps serving when new untagged entries dilute coverage below the floor', () => {
    // 26 tagged of 90 is 28.89%; only a tagging run can classify the rest.
    const next = { ...released(), bundles: [glossaryBundle(90)] };

    const lenient = compileContent(next);
    expect(lenient.ok).toBe(true);
    expect(lenient.warnings).toEqual([
      summary(60, 0, 0),
      `tag assignment release: entry coverage 28.89% is below the required 30.00%${floorSuffix}`,
    ]);

    const strict = compileContent(next, { strictTagging: true });
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.errors).toHaveLength(60);
    expect(strict.errors).toContain(
      `tag assignments: ${termKey(89)} is new since run ${RUN}`,
    );
  });

  it('keeps serving when stale drops take a tag below its population floor', () => {
    const input = withOverride(
      withOverride(released(), termKey(1), rewrite),
      termKey(2),
      rewrite,
    );
    const result = compileContent(input);
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain(
      `tag assignment release: published tag malware has 24 entries; at least 25 required${floorSuffix}`,
    );
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
