import { describe, expect, it } from 'vitest';

import { validateAssignmentHistory } from './check-tag-history.js';
import { compileContent, type ContentInput } from './compile.js';
import {
  migrateContent,
  migrateTagAssignments,
} from './migrate-tag-assignments.js';
import type { BundleFile, TagAssignmentsFileV1, TagsFile } from './model.js';
import {
  classificationEntryHashes,
  corpusHashFromEntryHashes,
  stableJsonHash,
  tagTaxonomyHash,
} from './tagging.js';

const RUN_ID = 'legacy-release';
const ENTRY_COUNT = 30;
const TAGGED = 26;

const tags: TagsFile = {
  taxonomyVersion: '2',
  tags: [{ slug: 'malware', name: 'Malware', lifecycle: 'PUBLISHED' }],
  retiredTags: [],
};

const termSlug = (index: number): string =>
  `term-${String(index).padStart(3, '0')}`;
const termKey = (index: number): string => `TERM:${termSlug(index)}`;

function bundle(definition = (index: number) => `Security concept ${index}.`) {
  const entries: BundleFile['entries'] = Array.from(
    { length: ENTRY_COUNT },
    (_, index) => ({
      entryType: 'TERM',
      slug: termSlug(index),
      title: `Term ${index}`,
      aliases: [],
      tags: [],
      summaryMd: undefined,
      updatedAt: '2026-06-01',
      senses: [
        {
          key: 's1',
          label: undefined,
          definitionMd: definition(index),
          expandedForm: undefined,
          examples: [],
          citation: {
            documentKey: 'doc-1',
            citationText: undefined,
            locator: undefined,
          },
        },
      ],
      relationships: [],
    }),
  );
  const file: BundleFile = {
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
    entries,
  };
  return file;
}

function contentInput(bundleFile: BundleFile = bundle()): ContentInput {
  return {
    sources: [
      {
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
      },
    ],
    tags,
    redirects: { redirects: [] },
    bundles: [bundleFile],
    overrides: new Map(),
  };
}

function liveEntryHashes(input: ContentInput): Record<string, string> {
  const live = compileContent(input, { allowUnreleasedTagging: true });
  if (!live.ok) throw new Error(live.errors.join('\n'));
  return classificationEntryHashes(
    live.classification.entries,
    live.classification.senses,
  );
}

/** A schemaVersion 1 release, as the emitter wrote it before per-entry hashes. */
function legacyRelease(input: ContentInput): TagAssignmentsFileV1 {
  const hashes = liveEntryHashes(input);
  const thresholds = { malware: 0.98 };
  return {
    schemaVersion: 1,
    taxonomyVersion: '2',
    taxonomyHash: tagTaxonomyHash(tags),
    run: {
      runId: RUN_ID,
      corpusHash: corpusHashFromEntryHashes(hashes),
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
    assignments: Array.from({ length: TAGGED }, (_, index) => {
      const entryContentHash = hashes[termKey(index)];
      if (!entryContentHash) throw new Error(`no live ${termKey(index)}`);
      return {
        entryKey: termKey(index),
        entryContentHash,
        tagSlug: 'malware',
        authority: 'SYNTHETIC_REFERENCE' as const,
        lane: 'AUTO' as const,
        score: 0.99,
        runId: RUN_ID,
      };
    }),
    removals: [],
  };
}

describe('migrateContent', () => {
  it('records the per-entry hashes the legacy corpus hash bound', () => {
    const input = contentInput();
    const legacy = legacyRelease(input);
    const migrated = migrateContent(input, legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.classifiedEntries).toEqual(liveEntryHashes(input));
    expect(Object.keys(migrated.classifiedEntries)).toHaveLength(ENTRY_COUNT);
    expect(corpusHashFromEntryHashes(migrated.classifiedEntries)).toBe(
      legacy.run.corpusHash,
    );
    expect('corpusHash' in migrated.run).toBe(false);
    expect(migrated.assignments).toEqual(legacy.assignments);
    expect(migrated.removals).toEqual([]);
    expect(migrated.run.previousAssignmentsHash).toBe(stableJsonHash(legacy));
    expect(validateAssignmentHistory(migrated, legacy)).toEqual([]);
  });

  it('keeps unedited entries tagged once one entry changes', () => {
    const input = contentInput();
    const migrated = migrateContent(input, legacyRelease(input));
    const edited = contentInput(
      bundle((index) =>
        index === 4 ? 'A rewritten definition.' : `Security concept ${index}.`,
      ),
    );
    const result = compileContent({ ...edited, tagAssignments: migrated });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tagged = result.dataset.entries.filter(
      (entry) => entry.tagSlugs.length > 0,
    );
    expect(tagged).toHaveLength(TAGGED - 1);
    expect(tagged.map((entry) => entry.key)).not.toContain(termKey(4));
  });

  it('refuses a live corpus that is not the one the run classified', () => {
    const legacy = legacyRelease(contentInput());
    const drifted = contentInput(
      bundle((index) =>
        index === 29
          ? 'A definition the source rewrote.'
          : `Security concept ${index}.`,
      ),
    );
    expect(() => migrateContent(drifted, legacy)).toThrow(
      `is not the corpus run ${RUN_ID} classified`,
    );
  });

  it('refuses a row whose hash is not the one the run classified', () => {
    const input = contentInput();
    const legacy = legacyRelease(input);
    const [first, ...rest] = legacy.assignments;
    if (!first) throw new Error('fixture has no assignments');
    const tampered: TagAssignmentsFileV1 = {
      ...legacy,
      assignments: [{ ...first, entryContentHash: '0'.repeat(64) }, ...rest],
    };
    expect(() => migrateContent(input, tampered)).toThrow(
      `${termKey(0)} -> malware does not match the hash run ${RUN_ID} classified`,
    );
  });

  it('refuses legacy removal records', () => {
    const input = contentInput();
    const legacy: TagAssignmentsFileV1 = {
      ...legacyRelease(input),
      removals: [
        {
          entryKey: termKey(29),
          tagSlug: 'malware',
          previousEntryContentHash: '0'.repeat(64),
          reason: 'Reviewed removal.',
          runId: RUN_ID,
        },
      ],
    };
    expect(() => migrateTagAssignments(legacy, liveEntryHashes(input))).toThrow(
      `run ${RUN_ID} carries removal records`,
    );
  });
});
