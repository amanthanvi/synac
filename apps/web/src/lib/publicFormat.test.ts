import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatRelativeDate,
  shortHash,
  toIsoString,
} from './publicFormat';

describe('formatDate', () => {
  it('formats as month-abbrev day, year in UTC', () => {
    expect(formatDate(new Date('2026-03-04T00:00:00.000Z'))).toBe(
      'Mar 04, 2026',
    );
  });

  it('does not shift across a UTC day boundary', () => {
    expect(formatDate(new Date('2026-01-01T23:59:59.000Z'))).toBe(
      'Jan 01, 2026',
    );
  });

  it('accepts ISO strings, as returned by unstable_cache', () => {
    expect(formatDate('2026-03-04T00:00:00.000Z')).toBe('Mar 04, 2026');
    expect(toIsoString('2026-03-04T00:00:00.000Z')).toBe(
      '2026-03-04T00:00:00.000Z',
    );
    expect(toIsoString(new Date('2026-03-04T00:00:00.000Z'))).toBe(
      '2026-03-04T00:00:00.000Z',
    );
  });
});

describe('formatRelativeDate', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('reports same-day and future dates as Today', () => {
    expect(formatRelativeDate(new Date('2026-06-15T09:00:00.000Z'), now)).toBe(
      'Today',
    );
    expect(formatRelativeDate(new Date('2026-07-01T00:00:00.000Z'), now)).toBe(
      'Today',
    );
  });

  it('uses singular and plural day labels', () => {
    expect(formatRelativeDate(new Date('2026-06-14T12:00:00.000Z'), now)).toBe(
      '1 day ago',
    );
    expect(formatRelativeDate(new Date('2026-06-12T12:00:00.000Z'), now)).toBe(
      '3 days ago',
    );
  });

  it('switches to weeks, months, then years', () => {
    expect(formatRelativeDate(new Date('2026-06-08T12:00:00.000Z'), now)).toBe(
      '1 week ago',
    );
    expect(formatRelativeDate(new Date('2026-05-25T12:00:00.000Z'), now)).toBe(
      '3 weeks ago',
    );
    expect(formatRelativeDate(new Date('2026-05-10T12:00:00.000Z'), now)).toBe(
      '1 month ago',
    );
    expect(formatRelativeDate(new Date('2026-01-10T12:00:00.000Z'), now)).toBe(
      '5 months ago',
    );
    expect(formatRelativeDate(new Date('2025-05-10T12:00:00.000Z'), now)).toBe(
      '1 year ago',
    );
    expect(formatRelativeDate(new Date('2023-05-10T12:00:00.000Z'), now)).toBe(
      '3 years ago',
    );
  });
});

describe('shortHash', () => {
  it('truncates long hashes and leaves short ones alone', () => {
    expect(shortHash('a'.repeat(64))).toBe('a'.repeat(12));
    expect(shortHash('abc')).toBe('abc');
    expect(shortHash('abcdefgh', 4)).toBe('abcd');
  });
});
