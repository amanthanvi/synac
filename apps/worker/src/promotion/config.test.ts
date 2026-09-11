import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseCsv } from '@synac/db';

import {
  getStagingDatabaseUrl,
  getStagingSourceAllowlist,
  getWorkerMode,
  isIngestEnabled,
  isPromotionEnabled,
  isTier1AutopublishEnabled,
  isWarnAutopublishEnabled,
} from './config.js';

const KEYS = [
  'SYNAC_WORKER_MODE',
  'SYNAC_STAGING_DATABASE_URL',
  'SYNAC_STAGING_SOURCE_ALLOWLIST',
  'SYNAC_AUTOPUBLISH_TIER1',
  'SYNAC_AUTOPUBLISH_WARN',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getWorkerMode', () => {
  it('honours an explicit ingest mode and its staging alias', () => {
    process.env.SYNAC_WORKER_MODE = 'ingest';
    expect(getWorkerMode()).toBe('ingest');
    process.env.SYNAC_WORKER_MODE = 'STAGING';
    expect(getWorkerMode()).toBe('ingest');
  });

  it('honours an explicit promotion mode and its aliases', () => {
    for (const value of ['promotion', 'prod', 'production']) {
      process.env.SYNAC_WORKER_MODE = value;
      expect(getWorkerMode()).toBe('promotion');
    }
  });

  it('honours all', () => {
    process.env.SYNAC_WORKER_MODE = 'all';
    expect(getWorkerMode()).toBe('all');
  });

  it('infers promotion when a staging database is configured', () => {
    process.env.SYNAC_STAGING_DATABASE_URL = 'postgresql://example/staging';
    expect(getWorkerMode()).toBe('promotion');
  });

  it('defaults to ingest with nothing configured', () => {
    expect(getWorkerMode()).toBe('ingest');
  });
});

describe('mode predicates', () => {
  it('enables ingest for ingest and all', () => {
    expect(isIngestEnabled('ingest')).toBe(true);
    expect(isIngestEnabled('all')).toBe(true);
    expect(isIngestEnabled('promotion')).toBe(false);
  });

  it('enables promotion for promotion and all', () => {
    expect(isPromotionEnabled('promotion')).toBe(true);
    expect(isPromotionEnabled('all')).toBe(true);
    expect(isPromotionEnabled('ingest')).toBe(false);
  });
});

describe('getStagingDatabaseUrl', () => {
  it('returns null when unset or blank', () => {
    expect(getStagingDatabaseUrl()).toBeNull();
    process.env.SYNAC_STAGING_DATABASE_URL = '   ';
    expect(getStagingDatabaseUrl()).toBeNull();
  });

  it('trims the configured value', () => {
    process.env.SYNAC_STAGING_DATABASE_URL = '  postgresql://example/staging  ';
    expect(getStagingDatabaseUrl()).toBe('postgresql://example/staging');
  });
});

describe('parseCsv and getStagingSourceAllowlist', () => {
  it('splits, trims and drops empties', () => {
    expect(parseCsv(' a , ,b,  c ')).toEqual(['a', 'b', 'c']);
    expect(parseCsv(undefined)).toEqual([]);
  });

  it('lowercases the allowlist', () => {
    process.env.SYNAC_STAGING_SOURCE_ALLOWLIST =
      'NIST-CSRC-Glossary, OWASP-Vulnerabilities';
    expect([...getStagingSourceAllowlist()]).toEqual([
      'nist-csrc-glossary',
      'owasp-vulnerabilities',
    ]);
  });
});

describe('isTier1AutopublishEnabled', () => {
  it('fails closed when unset', () => {
    expect(isTier1AutopublishEnabled()).toBe(false);
  });

  it('fails closed on a blank value', () => {
    process.env.SYNAC_AUTOPUBLISH_TIER1 = '   ';
    expect(isTier1AutopublishEnabled()).toBe(false);
  });

  it.each(['true', 'TRUE', '1', 'yes'])('enables on %s', (value) => {
    process.env.SYNAC_AUTOPUBLISH_TIER1 = value;
    expect(isTier1AutopublishEnabled()).toBe(true);
  });

  it.each(['false', '0', 'no', 'maybe'])('stays off on %s', (value) => {
    process.env.SYNAC_AUTOPUBLISH_TIER1 = value;
    expect(isTier1AutopublishEnabled()).toBe(false);
  });
});

describe('isWarnAutopublishEnabled', () => {
  it('fails closed when unset', () => {
    expect(isWarnAutopublishEnabled()).toBe(false);
  });

  it.each(['true', '1', 'yes'])('enables on %s', (value) => {
    process.env.SYNAC_AUTOPUBLISH_WARN = value;
    expect(isWarnAutopublishEnabled()).toBe(true);
  });

  it('stays off on false', () => {
    process.env.SYNAC_AUTOPUBLISH_WARN = 'false';
    expect(isWarnAutopublishEnabled()).toBe(false);
  });
});
