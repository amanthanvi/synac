import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADAPTER_SLUG,
  ADAPTER_VERSION,
  nistGlossaryAdapter,
  pairDefinitionsWithSources,
  parseNistSourceLabel,
  parseNistTermPage,
} from './nistGlossary.js';

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
);

function readFixture(name: string): string {
  return readFileSync(path.join(fixtures, name), 'utf8');
}

describe('parseNistSourceLabel', () => {
  it('strips the Source(s) prefix and the "under <term>" suffix', () => {
    expect(
      parseNistSourceLabel(
        'Source(s): NIST SP 800-53 Rev. 5 under Access Control',
      ),
    ).toBe('NIST SP 800-53 Rev. 5');
  });

  it('accepts a bare "Source:" prefix', () => {
    expect(parseNistSourceLabel('Source: CNSSI 4009-2015')).toBe(
      'CNSSI 4009-2015',
    );
  });

  it('keeps a label that has no suffix', () => {
    expect(parseNistSourceLabel('CNSSI 4009-2015')).toBe('CNSSI 4009-2015');
  });

  it('collapses whitespace and trims trailing separators', () => {
    expect(parseNistSourceLabel('Source(s):   NIST   SP  800-63B ;')).toBe(
      'NIST SP 800-63B',
    );
  });

  it('returns null for empty or absent input', () => {
    expect(parseNistSourceLabel(undefined)).toBeNull();
    expect(parseNistSourceLabel('   ')).toBeNull();
    expect(parseNistSourceLabel('Source(s):')).toBeNull();
  });

  it('rejects an implausibly long label', () => {
    expect(parseNistSourceLabel(`Source(s): ${'x'.repeat(300)}`)).toBeNull();
  });
});

describe('pairDefinitionsWithSources', () => {
  it('pairs positionally when the counts line up', () => {
    const paired = pairDefinitionsWithSources(
      ['d0', 'd1'],
      ['Source(s): A', 'Source(s): B'],
    );
    expect(paired).toEqual([
      { definition: 'd0', senseLabel: 'A', index: 0 },
      { definition: 'd1', senseLabel: 'B', index: 1 },
    ]);
  });

  it('leaves every label null rather than mis-attributing when the counts disagree', () => {
    const paired = pairDefinitionsWithSources(['d0', 'd1'], ['Source(s): A']);
    expect(paired.map((p) => p.senseLabel)).toEqual([null, null]);
    expect(paired.map((p) => p.index)).toEqual([0, 1]);
  });

  it('handles no sources at all', () => {
    expect(pairDefinitionsWithSources(['d0'], [])).toEqual([
      { definition: 'd0', senseLabel: null, index: 0 },
    ]);
  });
});

describe('parseNistTermPage', () => {
  it('produces one sense per #term-def-text-N span', () => {
    const parsed = parseNistTermPage(readFixture('nistTerm.html'));
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    expect(parsed.title).toBe('access control');
    expect(parsed.entryType).toBe('TERM');
    expect(parsed.senses).toHaveLength(2);
  });

  it('records the per-definition selector as the source locator', () => {
    const parsed = parseNistTermPage(readFixture('nistTerm.html'));
    expect(parsed?.senses.map((s) => s.selector)).toEqual([
      '#term-def-text-0',
      '#term-def-text-1',
    ]);
  });

  it('labels each sense from its own Source(s) line', () => {
    const parsed = parseNistTermPage(readFixture('nistTerm.html'));
    expect(parsed?.senses.map((s) => s.senseLabel)).toEqual([
      'NIST SP 800-53 Rev. 5',
      'CNSSI 4009-2015',
    ]);
  });

  it('decodes entities and collapses whitespace in the definition text', () => {
    const parsed = parseNistTermPage(readFixture('nistTerm.html'));
    const first = parsed?.senses[0];
    expect(first?.definitionMd).toBe(
      'The process of granting or denying specific requests to obtain and use information & related information processing services.',
    );
  });

  it('extracts abbreviation variants', () => {
    const parsed = parseNistTermPage(readFixture('nistTerm.html'));
    expect(parsed?.variants).toContainEqual({
      variantText: 'AC',
      variantType: 'ABBREVIATION',
    });
  });

  it('leaves labels null when source lines do not cover every definition', () => {
    const parsed = parseNistTermPage(readFixture('nistTermNoSources.html'));
    expect(parsed?.senses).toHaveLength(2);
    expect(parsed?.senses.map((s) => s.senseLabel)).toEqual([null, null]);
    expect(parsed?.entryType).toBe('ACRONYM');
  });

  it('returns null when the page has no title', () => {
    expect(
      parseNistTermPage(
        '<html><body><span id="term-def-text-0">x</span></body></html>',
      ),
    ).toBeNull();
  });

  it('returns null when the page has no definitions', () => {
    expect(
      parseNistTermPage('<html><body><h3 id="term-text">x</h3></body></html>'),
    ).toBeNull();
  });
});

describe('nistGlossaryAdapter', () => {
  it('registers under the NIST source slug with a pinned adapter version', () => {
    expect(nistGlossaryAdapter.slug).toBe(ADAPTER_SLUG);
    expect(ADAPTER_SLUG).toBe('nist-csrc-glossary');
    expect(nistGlossaryAdapter.version).toBe(ADAPTER_VERSION);
  });
});
