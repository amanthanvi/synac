import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADAPTER_VERSION,
  buildTacticRelationships,
  collectTacticNames,
  getAttackPatterns,
  MITRE_ADAPTER_SLUGS,
  mitreAttackCtiAdapters,
  titleCasePhaseName,
} from './mitreAttackCti.js';
import { stripStixCitations } from './stixText.js';

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
);

const bundle = JSON.parse(
  readFileSync(path.join(fixtures, 'mitreAttackBundle.json'), 'utf8'),
) as { objects?: unknown[] };

describe('getAttackPatterns', () => {
  it('keeps only usable attack-patterns', () => {
    const patterns = getAttackPatterns(bundle);
    expect(patterns.map((p) => p.externalId)).toEqual(['T1134', 'T1555']);
  });

  it('drops deprecated and revoked techniques', () => {
    const names = getAttackPatterns(bundle).map((p) => p.name);
    expect(names).not.toContain('Deprecated Technique');
    expect(names).not.toContain('Revoked Technique');
  });

  it('drops techniques without a mitre-attack external id', () => {
    expect(getAttackPatterns(bundle).map((p) => p.name)).not.toContain(
      'No External Id',
    );
  });

  it('collects only mitre kill-chain phase names', () => {
    const unknownTactic = getAttackPatterns(bundle).find(
      (p) => p.externalId === 'T1555',
    );
    expect(unknownTactic?.tacticPhaseNames).toEqual(['credential-access']);
  });

  it('tolerates a bundle with no objects', () => {
    expect(getAttackPatterns({})).toEqual([]);
    expect(getAttackPatterns({ objects: [null, 'nonsense', 42] })).toEqual([]);
  });
});

describe('collectTacticNames', () => {
  it('maps x_mitre_shortname to the tactic display name', () => {
    const names = collectTacticNames(bundle);
    expect(names.get('defense-evasion')).toBe('Defense Evasion');
    expect(names.get('privilege-escalation')).toBe('Privilege Escalation');
  });

  it('has no entry for a tactic absent from the bundle', () => {
    expect(collectTacticNames(bundle).has('credential-access')).toBe(false);
  });
});

describe('titleCasePhaseName', () => {
  it('title-cases a kebab phase name', () => {
    expect(titleCasePhaseName('credential-access')).toBe('Credential Access');
  });

  it('handles a single word', () => {
    expect(titleCasePhaseName('impact')).toBe('Impact');
  });

  it('returns an empty string for empty input', () => {
    expect(titleCasePhaseName('')).toBe('');
  });
});

describe('buildTacticRelationships', () => {
  const tacticNames = collectTacticNames(bundle);

  it('emits one BROADER_THAN per tactic, named from the bundle', () => {
    const pattern = getAttackPatterns(bundle).find(
      (p) => p.externalId === 'T1134',
    );
    expect(pattern).toBeDefined();
    if (!pattern) return;

    const rels = buildTacticRelationships(pattern, tacticNames);
    expect(rels).toEqual([
      {
        type: 'BROADER_THAN',
        targetTitle: 'Defense Evasion',
        note: 'ATT&CK tactic for technique T1134',
      },
      {
        type: 'BROADER_THAN',
        targetTitle: 'Privilege Escalation',
        note: 'ATT&CK tactic for technique T1134',
      },
    ]);
  });

  it('falls back to a title-cased phase name when the tactic object is missing', () => {
    const pattern = getAttackPatterns(bundle).find(
      (p) => p.externalId === 'T1555',
    );
    expect(pattern).toBeDefined();
    if (!pattern) return;

    const rels = buildTacticRelationships(pattern, tacticNames);
    expect(rels.map((r) => r.targetTitle)).toEqual(['Credential Access']);
  });

  it('emits nothing for a technique with no kill-chain phases', () => {
    const rels = buildTacticRelationships(
      {
        stixId: 'x',
        externalId: 'T0',
        name: 'n',
        description: 'd',
        tacticPhaseNames: [],
      },
      tacticNames,
    );
    expect(rels).toEqual([]);
  });
});

describe('description cleaning', () => {
  it('strips inline (Citation: ...) markers from the technique description', () => {
    const pattern = getAttackPatterns(bundle).find(
      (p) => p.externalId === 'T1134',
    );
    expect(pattern).toBeDefined();
    if (!pattern) return;

    const cleaned = stripStixCitations(pattern.description);
    expect(cleaned).not.toContain('Citation:');
    expect(cleaned).toContain('Adversaries may modify access tokens');
    expect(cleaned).toContain('built-in Windows API functions');
  });
});

describe('mitreAttackCtiAdapters', () => {
  it('registers the three ATT&CK domains against one parser', () => {
    expect(mitreAttackCtiAdapters.map((a) => a.slug)).toEqual([
      ...MITRE_ADAPTER_SLUGS,
    ]);
    for (const adapter of mitreAttackCtiAdapters) {
      expect(adapter.version).toBe(ADAPTER_VERSION);
    }
  });
});
