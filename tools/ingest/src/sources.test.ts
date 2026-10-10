import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourceFileSchema, type SourceFile } from '@synac/content-tools';
import { afterEach, describe, expect, it } from 'vitest';

import {
  isIngestable,
  loadSourceRegistry,
  selectIngestSources,
} from './sources.js';

const repoContentDir = fileURLToPath(
  new URL('../../../content', import.meta.url),
);
const cliPath = fileURLToPath(new URL('./cli.ts', import.meta.url));

function sourceJson(
  slug: string,
  overrides: { enabled?: boolean; ingest?: boolean; baseUrl?: string } = {},
) {
  return {
    slug,
    name: slug,
    baseUrl: overrides.baseUrl ?? `https://${slug}.example.gov/`,
    license: {
      type: 'US_GOV_PD',
      contentMode: 'QUOTED',
      allowedUse: 'Reproduce with citation.',
      attributionRequirements: slug,
    },
    accessMethod: 'HTML',
    trustTier: 'TIER1',
    enabled: overrides.enabled ?? true,
    ...(overrides.ingest === false
      ? {}
      : { ingest: { adapter: 'nistGlossary', schedule: 'weekly' } }),
    lastVerifiedAt: '2026-07-01',
  };
}

function source(
  slug: string,
  overrides: Parameters<typeof sourceJson>[1] = {},
): SourceFile {
  return sourceFileSchema.parse(sourceJson(slug, overrides));
}

const registry = [
  source('zeta'),
  source('alpha'),
  source('disabled', { enabled: false }),
  source('manual', { ingest: false }),
];

describe('isIngestable', () => {
  it('needs both the enabled flag and an ingest block', () => {
    expect(isIngestable(source('a'))).toBe(true);
    expect(isIngestable(source('a', { enabled: false }))).toBe(false);
    expect(isIngestable(source('a', { ingest: false }))).toBe(false);
  });
});

describe('selectIngestSources', () => {
  it('lists enabled sources with an adapter, sorted by slug', () => {
    expect(selectIngestSources(registry)).toEqual(['alpha', 'zeta']);
  });

  it('narrows to a requested ingestable source', () => {
    expect(selectIngestSources(registry, 'zeta')).toEqual(['zeta']);
  });

  it('rejects a requested source that is not enabled for ingest', () => {
    expect(() => selectIngestSources(registry, 'disabled')).toThrow(
      'disabled: source is not enabled for ingest',
    );
    expect(() => selectIngestSources(registry, 'manual')).toThrow(
      'manual: source is not enabled for ingest',
    );
  });

  it('rejects a requested source with no registry file', () => {
    expect(() => selectIngestSources(registry, 'typo')).toThrow(
      'typo: no source registry file',
    );
  });

  it('returns an empty list when nothing is ingestable', () => {
    expect(selectIngestSources([source('off', { enabled: false })])).toEqual(
      [],
    );
  });
});

describe('the checked-in source registry', () => {
  it('fans out to every shipped source', async () => {
    const sources = await loadSourceRegistry(repoContentDir);
    expect(selectIngestSources(sources)).toEqual([
      'mitre-attack-cti',
      'niccs-glossary',
      'nist-csrc-glossary',
      'owasp-vulnerabilities',
      'rfc4949',
    ]);
  });

  // Each source runs in its own workflow job, and the crawler paces requests
  // per host only within one process. Two parallel jobs on one host would
  // double its request rate.
  it('gives each ingestable source its own host', async () => {
    const sources = (await loadSourceRegistry(repoContentDir)).filter(
      isIngestable,
    );
    const hosts = sources.map((s) => new URL(s.baseUrl).hostname);
    expect(new Set(hosts).size).toBe(hosts.length);
  });
});

describe('ingest --list', () => {
  const contentDirs: string[] = [];

  afterEach(() => {
    for (const dir of contentDirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  function runList(...extra: string[]) {
    const contentDir = mkdtempSync(path.join(tmpdir(), 'synac-ingest-list-'));
    contentDirs.push(contentDir);
    mkdirSync(path.join(contentDir, 'sources'));
    for (const json of [
      sourceJson('beta'),
      sourceJson('alpha'),
      sourceJson('off', { enabled: false }),
    ]) {
      writeFileSync(
        path.join(contentDir, 'sources', `${json.slug}.json`),
        JSON.stringify(json),
      );
    }
    return spawnSync(
      process.execPath,
      ['--import', 'tsx', cliPath, '--list', ...extra],
      {
        encoding: 'utf8',
        env: { ...process.env, SYNAC_CONTENT_DIR: contentDir },
      },
    );
  }

  it('prints only a JSON array of slugs on stdout', () => {
    const result = runList();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['alpha', 'beta']);
  });

  it('honours --source', () => {
    const result = runList('--source', 'beta');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['beta']);
  });

  it('rejects --source without a slug instead of listing everything', () => {
    for (const result of [runList('--source'), runList('--source', '--all')]) {
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--source needs a source slug');
    }
  });

  it('exits non-zero with nothing on stdout for an unusable --source', () => {
    const result = runList('--source', 'off');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('off: source is not enabled for ingest');
  });
});
