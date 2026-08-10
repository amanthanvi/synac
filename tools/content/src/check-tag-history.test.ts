import { describe, expect, it } from 'vitest';

import type { TagAssignmentsFile } from './model.js';
import { stableJsonHash } from './tagging.js';
import {
  EMPTY_TREE_SHA,
  resolveBaseRef,
  validateAssignmentHistory,
} from './check-tag-history.js';

function artifact(
  runId: string,
  pairs: Array<[string, string]>,
): TagAssignmentsFile {
  const thresholds = { malware: 0.98 };
  return {
    schemaVersion: 1,
    taxonomyVersion: '2',
    taxonomyHash: 'a'.repeat(64),
    run: {
      runId,
      corpusHash: 'b'.repeat(64),
      model: 'test',
      modelHash: 'c'.repeat(64),
      promptHash: 'd'.repeat(64),
      configHash: 'e'.repeat(64),
      calibrationHash: 'f'.repeat(64),
      certificationHash: '1'.repeat(64),
      thresholds,
      thresholdsHash: stableJsonHash(thresholds),
      labelOrigin: 'synthetic_ai_panel',
      createdAt: '2026-08-10T00:00:00Z',
      release: true,
    },
    assignments: pairs.map(([entryKey, tagSlug]) => ({
      entryKey,
      entryContentHash: '2'.repeat(64),
      tagSlug,
      authority: 'SYNTHETIC_REFERENCE',
      lane: 'AUTO',
      score: 0.99,
      runId,
    })),
    removals: [],
  };
}

describe('validateAssignmentHistory', () => {
  it('allows the first generation without removals', () => {
    expect(
      validateAssignmentHistory(
        artifact('first', [['TERM:alpha', 'malware']]),
        undefined,
      ),
    ).toEqual([]);
  });

  it('rejects silent loss and a wrong predecessor hash', () => {
    const previous = artifact('previous', [['TERM:alpha', 'malware']]);
    const current = artifact('current', []);
    current.run.previousAssignmentsHash = '3'.repeat(64);
    expect(validateAssignmentHistory(current, previous)).toEqual([
      expect.stringContaining('previousAssignmentsHash'),
      'silent assignment loss: TERM:alpha -> malware',
    ]);
  });

  it('accepts an exact reviewed removal bound to the predecessor', () => {
    const previous = artifact('previous', [['TERM:alpha', 'malware']]);
    const current = artifact('current', []);
    current.run.previousAssignmentsHash = stableJsonHash(previous);
    current.removals = [
      {
        entryKey: 'TERM:alpha',
        tagSlug: 'malware',
        previousEntryContentHash: '2'.repeat(64),
        reason: 'Reviewed taxonomy correction.',
        runId: 'current',
      },
    ];
    expect(validateAssignmentHistory(current, previous)).toEqual([]);
  });

  it('rejects spurious removals', () => {
    const previous = artifact('previous', [['TERM:alpha', 'malware']]);
    const current = artifact('current', [['TERM:alpha', 'malware']]);
    current.run.previousAssignmentsHash = stableJsonHash(previous);
    current.removals = [
      {
        entryKey: 'TERM:beta',
        tagSlug: 'malware',
        previousEntryContentHash: '2'.repeat(64),
        reason: 'Not real.',
        runId: 'current',
      },
    ];
    expect(validateAssignmentHistory(current, previous)).toContain(
      'spurious removal: TERM:beta -> malware',
    );
  });

  it('rejects duplicate removals and foreign removal run IDs', () => {
    const previous = artifact('previous', [['TERM:alpha', 'malware']]);
    const current = artifact('current', []);
    current.run.previousAssignmentsHash = stableJsonHash(previous);
    const removal = {
      entryKey: 'TERM:alpha' as const,
      tagSlug: 'malware',
      previousEntryContentHash: '2'.repeat(64),
      reason: 'Reviewed removal.',
      runId: 'foreign',
    };
    current.removals = [removal, { ...removal }];
    expect(validateAssignmentHistory(current, previous)).toEqual(
      expect.arrayContaining([
        'duplicate removal: TERM:alpha -> malware',
        'removal foreign run ID: TERM:alpha -> malware',
      ]),
    );
  });
});

describe('resolveBaseRef', () => {
  it('uses the local origin/main merge base when available, then HEAD', () => {
    expect(resolveBaseRef(['node', 'script'], '', 'merge-base')).toBe(
      'merge-base',
    );
    expect(resolveBaseRef(['node', 'script'], '   ', undefined)).toBe('HEAD');
  });

  it('keeps configured CI and explicit bases authoritative', () => {
    expect(resolveBaseRef(['node', 'script'], 'ci-base', 'merge-base')).toBe(
      'ci-base',
    );
    expect(
      resolveBaseRef(
        ['node', 'script', '--base', 'explicit'],
        'ci-base',
        'merge-base',
      ),
    ).toBe('explicit');
    expect(() => resolveBaseRef(['node', 'script', '--base'], 'main')).toThrow(
      /requires a Git ref/,
    );
  });

  it('maps all-zero push bases to the Git empty tree', () => {
    expect(resolveBaseRef(['node', 'script'], '0'.repeat(40))).toBe(
      EMPTY_TREE_SHA,
    );
    expect(
      resolveBaseRef(['node', 'script', '--base', '0'.repeat(64)], 'ignored'),
    ).toBe(EMPTY_TREE_SHA);
  });
});
