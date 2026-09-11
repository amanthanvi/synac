import { describe, expect, it } from 'vitest';

import { stripStixCitations } from './stixText.js';

describe('stripStixCitations', () => {
  it('removes a single citation marker and tidies the space before punctuation', () => {
    expect(
      stripStixCitations(
        'Adversaries may abuse tokens. (Citation: Microsoft Tokens)',
      ),
    ).toBe('Adversaries may abuse tokens.');
  });

  it('removes an inline marker mid-sentence', () => {
    expect(
      stripStixCitations(
        'APT28 (Citation: FireEye APT28) has used this technique.',
      ),
    ).toBe('APT28 has used this technique.');
  });

  it('removes several adjacent markers', () => {
    expect(
      stripStixCitations(
        'Observed in the wild.(Citation: A)(Citation: B)(Citation: C)',
      ),
    ).toBe('Observed in the wild.');
  });

  it('handles one level of nested parentheses inside a marker', () => {
    expect(
      stripStixCitations(
        'Text here (Citation: FireEye (2019) Report) follows.',
      ),
    ).toBe('Text here follows.');
  });

  it('is case-insensitive on the marker keyword', () => {
    expect(
      stripStixCitations('Something (citation: Lowercase Source) else.'),
    ).toBe('Something else.');
  });

  it('tolerates whitespace after the opening parenthesis', () => {
    expect(stripStixCitations('Value ( Citation: Spaced ) here.')).toBe(
      'Value here.',
    );
  });

  it('collapses runs of spaces and tabs', () => {
    expect(stripStixCitations('a    b\t\tc')).toBe('a b c');
  });

  it('preserves paragraph breaks', () => {
    const input =
      'First paragraph. (Citation: X)\n\nSecond paragraph. (Citation: Y)';
    expect(stripStixCitations(input)).toBe(
      'First paragraph.\n\nSecond paragraph.',
    );
  });

  it('collapses three or more newlines down to one blank line', () => {
    expect(stripStixCitations('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('leaves text without markers untouched apart from trimming', () => {
    expect(stripStixCitations('  Plain description.  ')).toBe(
      'Plain description.',
    );
  });

  it('does not strip ordinary parentheticals', () => {
    expect(
      stripStixCitations(
        'Uses LSASS (Local Security Authority Subsystem Service).',
      ),
    ).toBe('Uses LSASS (Local Security Authority Subsystem Service).');
  });

  it('returns an empty string for empty input', () => {
    expect(stripStixCitations('')).toBe('');
  });

  it('returns an empty string when the text was only a marker', () => {
    expect(stripStixCitations('(Citation: Only This)')).toBe('');
  });
});
