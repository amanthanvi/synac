import { describe, expect, it } from 'vitest';

import { parseCsvRecords } from './niccsGlossary.js';

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

