import { describe, it, expect } from 'vitest';
import MiniSearch from 'minisearch';
import { buildIndexPayload, type SearchDoc } from '../../src/lib/searchBuild';

describe('search index builder', () => {
  it('builds a MiniSearch index and supports searching by term, acronym, and tags', () => {
    const docs: SearchDoc[] = [
      {
        id: 'xss',
        term: 'Cross-Site Scripting',
        acronym: ['XSS'],
        aliases: ['Cross Site Scripting'],
        text: 'injection browser script',
        tags: ['web', 'cwe'],
        sourceKinds: ['CWE', 'CAPEC'],
      },
      {
        id: 'tls',
        term: 'Transport Layer Security',
        acronym: ['TLS'],
        aliases: [],
        text: 'cryptography protocol',
        tags: ['crypto'],
        sourceKinds: ['RFC'],
      },
    ];

    const payload = buildIndexPayload(docs);
    // buildIndexPayload returns a JSON string of MiniSearch.toJSON(); pass it directly
    const mini = MiniSearch.loadJSON(payload.index as string, payload.options as any);

    // search by acronym
    const r1 = mini.search('xss', payload.options.searchOptions);
    expect(r1.some((r) => (r as any).id === 'xss')).toBe(true);

    // search by term
    const r2 = mini.search('TLS', payload.options.searchOptions);
    expect(r2.some((r) => (r as any).id === 'tls')).toBe(true);

    // search by tag/text
    const r3 = mini.search('web', payload.options.searchOptions);
    expect(r3.some((r) => (r as any).id === 'xss')).toBe(true);
  });
});
