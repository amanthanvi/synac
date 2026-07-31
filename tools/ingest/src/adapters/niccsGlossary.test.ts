import { describe, expect, it } from 'vitest';

import { bundleEntriesFromRows, parseCsvRecords, parseNiccsRows } from './niccsGlossary.js';

describe('niccs csv parsing', () => {
  it('parses quoted fields with commas', () => {
    const csv = [
      'Term,"Acronym Expansion",Definition,"Extended Definition","Related Term(s)",Synonym(s),From',
      'AIaaS,"Artificial Intelligence as a Service","a cloud-based service, offering artificial intelligence (AI) outsourcing",,,,',
    ].join('\n');

    const records = parseCsvRecords(csv);
    expect(records).toHaveLength(2);
    expect(records[1]).toEqual([
      'AIaaS',
      'Artificial Intelligence as a Service',
      'a cloud-based service, offering artificial intelligence (AI) outsourcing',
      '',
      '',
      '',
      '',
    ]);
  });

  it('parses escaped quotes inside quoted fields', () => {
    const csv = ['Term,Definition', '"X","He said ""hello"" to me"'].join('\n');
    const records = parseCsvRecords(csv);
    expect(records[1]).toEqual(['X', 'He said "hello" to me']);
  });

  it('preserves newlines inside quoted fields', () => {
    const csv = ['Term,Definition', '"X","line1', 'line2"'].join('\n');
    const records = parseCsvRecords(csv);
    expect(records).toHaveLength(2);
    expect(records[1]).toEqual(['X', 'line1\nline2']);
  });
});

describe('niccs bundle mapping', () => {
  const csv = [
    'Term,"Acronym Expansion",Definition,"Extended Definition","Related Term(s)",Synonym(s),From',
    'AIaaS,"Artificial Intelligence as a Service","a cloud-based service, offering AI outsourcing","An extended definition.",,"AI service; hosted AI",NICCS',
    'access control,,"the process of granting or denying requests",,authorization,,NICCS',
    'no definition,,,,,,NICCS',
  ].join('\n');

  it('maps rows onto entries with stable sense keys and citations', () => {
    const entries = bundleEntriesFromRows(parseNiccsRows(csv), 100);
    expect(entries.map((e) => e.slug)).toEqual(['aiaas', 'access-control']);

    const aiaas = entries[0]!;
    expect(aiaas.entryType).toBe('ACRONYM');
    expect(aiaas.aliases).toEqual(['AI service', 'hosted AI']);
    expect(aiaas.summaryMd).toBe('a cloud-based service, offering AI outsourcing');
    expect(aiaas.senses).toHaveLength(1);
    expect(aiaas.senses[0]!.key).toBe('aiaas');
    expect(aiaas.senses[0]!.expandedForm).toBe('Artificial Intelligence as a Service');
    expect(aiaas.senses[0]!.definitionMd).toBe(
      'a cloud-based service, offering AI outsourcing\n\nAn extended definition.',
    );
    expect(aiaas.senses[0]!.citation).toMatchObject({
      documentKey: 'niccs-glossary-csv',
      citationText: 'NICCS Cybersecurity Vocabulary, "AIaaS"',
      locator: 'row 2',
    });

    const accessControl = entries[1]!;
    expect(accessControl.entryType).toBe('TERM');
    expect(accessControl.senses[0]!.expandedForm).toBeUndefined();
  });

  it('respects maxItems', () => {
    const entries = bundleEntriesFromRows(parseNiccsRows(csv), 1);
    expect(entries.map((e) => e.slug)).toEqual(['aiaas']);
  });
});
