import { describe, expect, it } from 'vitest';

import { bundleEntriesFromPatterns, getAttackPatterns } from './mitreAttackCti.js';

const stixBundle = {
  objects: [
    {
      type: 'attack-pattern',
      id: 'attack-pattern-0001',
      name: 'Command and Scripting Interpreter',
      description:
        'Adversaries may abuse command and script interpreters to execute commands.\n\nA second paragraph with detail.',
      external_references: [
        { source_name: 'mitre-attack', external_id: 'T1059' },
        { source_name: 'capec', external_id: 'CAPEC-242' },
      ],
    },
    {
      type: 'attack-pattern',
      id: 'attack-pattern-0002',
      name: 'Revoked Technique',
      description: 'Should be skipped.',
      revoked: true,
      external_references: [{ source_name: 'mitre-attack', external_id: 'T9998' }],
    },
    {
      type: 'attack-pattern',
      id: 'attack-pattern-0003',
      name: 'Deprecated Technique',
      description: 'Should be skipped.',
      x_mitre_deprecated: true,
      external_references: [{ source_name: 'mitre-attack', external_id: 'T9999' }],
    },
    {
      type: 'attack-pattern',
      id: 'attack-pattern-0004',
      name: 'No External Id',
      description: 'Should be skipped.',
      external_references: [{ source_name: 'capec', external_id: 'CAPEC-1' }],
    },
    {
      type: 'intrusion-set',
      id: 'intrusion-set-0001',
      name: 'Not an attack pattern',
    },
  ],
};

describe('mitre attack stix parsing', () => {
  it('keeps only live attack-patterns with a mitre-attack external id', () => {
    const patterns = getAttackPatterns(stixBundle);
    expect(patterns).toEqual([
      {
        stixId: 'attack-pattern-0001',
        externalId: 'T1059',
        name: 'Command and Scripting Interpreter',
        description:
          'Adversaries may abuse command and script interpreters to execute commands.\n\nA second paragraph with detail.',
      },
    ]);
  });

  it('maps techniques onto entries keyed by ATT&CK id', () => {
    const [entry] = bundleEntriesFromPatterns(getAttackPatterns(stixBundle), 100);
    expect(entry).toMatchObject({
      entryType: 'TERM',
      slug: 'command-and-scripting-interpreter',
      title: 'Command and Scripting Interpreter',
      tags: [],
      summaryMd: 'Adversaries may abuse command and script interpreters to execute commands.',
    });
    expect(entry!.senses).toHaveLength(1);
    expect(entry!.senses[0]!.key).toBe('T1059');
    expect(entry!.senses[0]!.label).toBe('T1059');
    expect(entry!.senses[0]!.citation).toMatchObject({
      documentKey: 'mitre-attack-enterprise-json',
      citationText: 'MITRE ATT&CK, T1059 Command and Scripting Interpreter',
      locator: 'attack-pattern-0001',
    });
  });
});
