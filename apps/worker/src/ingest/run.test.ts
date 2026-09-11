import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { ADAPTER_REGISTRY, resolveAdapter, runIngestRun } from './run.js';

const prisma = createIntegrationTestClient();

const EXPECTED_SLUGS = [
  'nist-csrc-glossary',
  'niccs-cisa-glossary',
  'owasp-vulnerabilities',
  'ietf-rfc4949-glossary',
  'mitre-attack-cti',
  'mitre-attack-mobile-cti',
  'mitre-attack-ics-cti',
];

describe('adapter registry', () => {
  it('registers every configured source slug', () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(ADAPTER_REGISTRY.has(slug)).toBe(true);
    }
    expect(ADAPTER_REGISTRY.size).toBe(EXPECTED_SLUGS.length);
  });

  it('every registered adapter reports its own slug and a pinned version', () => {
    for (const [slug, adapter] of ADAPTER_REGISTRY) {
      expect(adapter.slug).toBe(slug);
      expect(adapter.version).toMatch(/@\d+$/);
    }
  });
});

describe('resolveAdapter', () => {
  it('dispatches on sourceSlug first', () => {
    const adapter = resolveAdapter({
      sourceSlug: 'mitre-attack-ics-cti',
      // A hostname that would otherwise resolve to the NIST adapter.
      baseUrl: 'https://csrc.nist.gov/glossary',
    });
    expect(adapter?.slug).toBe('mitre-attack-ics-cti');
  });

  it('is case- and whitespace-insensitive on the slug', () => {
    expect(
      resolveAdapter({
        sourceSlug: '  NIST-CSRC-Glossary ',
        baseUrl: 'https://x.invalid',
      })?.slug,
    ).toBe('nist-csrc-glossary');
  });

  it.each([
    ['https://csrc.nist.gov/glossary', 'nist-csrc-glossary'],
    [
      'https://niccs.cisa.gov/cybersecurity-career-resources/glossary',
      'niccs-cisa-glossary',
    ],
    [
      'https://owasp.org/www-community/vulnerabilities',
      'owasp-vulnerabilities',
    ],
    ['https://cheatsheetseries.owasp.org/index.html', 'owasp-vulnerabilities'],
    ['https://www.rfc-editor.org/rfc/rfc4949.txt', 'ietf-rfc4949-glossary'],
    ['https://rfc-editor.org/rfc/rfc4949.txt', 'ietf-rfc4949-glossary'],
    [
      'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack.json',
      'mitre-attack-cti',
    ],
  ])('falls back to the hostname for %s', (baseUrl, expectedSlug) => {
    expect(
      resolveAdapter({ sourceSlug: 'legacy-unknown-slug', baseUrl })?.slug,
    ).toBe(expectedSlug);
  });

  it('returns null for an unknown slug and unknown hostname', () => {
    expect(
      resolveAdapter({
        sourceSlug: 'nope',
        baseUrl: 'https://example.invalid/x',
      }),
    ).toBeNull();
  });

  it('returns null for an unparsable baseUrl', () => {
    expect(
      resolveAdapter({ sourceSlug: 'nope', baseUrl: 'not a url' }),
    ).toBeNull();
  });
});

async function createSource(input: { sourceSlug: string; baseUrl: string }) {
  return prisma.source.create({
    data: {
      name: 'Test Source',
      sourceSlug: input.sourceSlug,
      baseUrl: input.baseUrl,
      licenseType: 'PUBLIC_DOMAIN',
      allowedUse: 'Allowed',
      attributionRequirements: 'Attribution required',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: new Date(),
    },
    select: { id: true },
  });
}

describe('runIngestRun', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('throws when the run does not exist', async () => {
    await expect(
      runIngestRun('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/Ingest run not found/);
  });

  it('returns without touching a run that is not RUNNING', async () => {
    const source = await createSource({
      sourceSlug: 'unknown-source-slug',
      baseUrl: 'https://example.invalid/glossary',
    });

    const run = await prisma.ingestRun.create({
      data: {
        sourceId: source.id,
        startedAt: new Date(),
        status: 'SUCCESS',
        triggeredBy: 'MANUAL',
      },
      select: { id: true },
    });

    // No adapter exists for this source, so an early return is the only way
    // this can resolve without throwing.
    await expect(runIngestRun(run.id)).resolves.toBeUndefined();

    const after = await prisma.ingestRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, finishedAt: true, stats: true },
    });
    expect(after.status).toBe('SUCCESS');
    expect(after.finishedAt).toBeNull();
    expect(after.stats).toBeNull();
  });

  it('fails the run when no adapter matches the source', async () => {
    const source = await createSource({
      sourceSlug: 'unknown-source-slug',
      baseUrl: 'https://example.invalid/glossary',
    });

    const run = await prisma.ingestRun.create({
      data: {
        sourceId: source.id,
        startedAt: new Date(),
        status: 'RUNNING',
        triggeredBy: 'MANUAL',
      },
      select: { id: true },
    });

    await expect(runIngestRun(run.id)).rejects.toThrow(
      /No ingest adapter configured/,
    );

    const after = await prisma.ingestRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, finishedAt: true, stats: true },
    });
    expect(after.status).toBe('FAILED');
    expect(after.finishedAt).not.toBeNull();
    expect(JSON.stringify(after.stats)).toContain(
      'No ingest adapter configured',
    );
  });
});
