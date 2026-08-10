import { describe, expect, it } from 'vitest';

import type { TagAssignmentsFile } from './model.js';
import { stableJsonHash } from './tagging.js';
import {
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
});

describe('resolveBaseRef', () => {
  it('falls back to HEAD when workflow_dispatch provides an empty value', () => {
    expect(resolveBaseRef(['node', 'script'], '')).toBe('HEAD');
    expect(resolveBaseRef(['node', 'script'], '   ')).toBe('HEAD');
  });

  it('prefers an explicit base and rejects a missing explicit value', () => {
    expect(resolveBaseRef(['node', 'script', '--base', 'main'], 'other')).toBe(
      'main',
    );
    expect(() => resolveBaseRef(['node', 'script', '--base'], 'main')).toThrow(
      /requires a Git ref/,
    );
  });
});
