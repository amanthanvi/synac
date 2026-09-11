import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  disconnectIntegrationPrisma,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  SEARCH_BUCKET,
  countSearchResults,
  searchPublishedEntries,
  searchPublishedEntriesPage,
  suggestSearchCorrection,
} from './search.js';

const prisma = createIntegrationTestClient();

type SeedSense = {
  order: number;
  label?: string;
  expandedForm?: string;
  slug?: string;
  definition: string;
};

async function seedEntry(input: {
  entryType: 'TERM' | 'ACRONYM';
  title: string;
  slug: string;
  summary: string;
  senses: SeedSense[];
  variants?: string[];
}): Promise<string> {
  const entry = await prisma.entry.create({
    data: {
      entryType: input.entryType,
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: input.summary,
      summaryText: input.summary,
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  for (const sense of input.senses) {
    await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: sense.order,
        senseLabel: sense.label ?? null,
        expandedForm: sense.expandedForm ?? null,
        slug: sense.slug ?? null,
        definitionMd: sense.definition,
        definitionText: sense.definition,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  for (const variant of input.variants ?? []) {
    await prisma.entryVariant.create({
      data: {
        entryId: entry.id,
        variantText: variant,
        normalizedVariant: variant.toLowerCase(),
        variantType: 'ALIAS',
      },
    });
  }

  return entry.id;
}

type SeededCorpus = {
  socId: string;
  securityOperationsId: string;
  authenticationId: string;
  zeroTrustId: string;
  identityTagId: string;
};

async function seedCorpus(): Promise<SeededCorpus> {
  const socId = await seedEntry({
    entryType: 'ACRONYM',
    title: 'SOC',
    slug: 'soc',
    summary:
      'SOC is an ambiguous acronym with meanings in defense and hardware.',
    senses: [
      {
        order: 0,
        label: 'Security Operations Center',
        expandedForm: 'Security Operations Center',
        slug: 'security-operations-center',
        definition:
          'A facility where analysts continuously watch for and respond to intrusions.',
      },
      {
        order: 1,
        label: 'System on Chip',
        expandedForm: 'System on Chip',
        slug: 'system-on-chip',
        definition:
          'An integrated circuit that packages processor, memory, and peripherals on one die.',
      },
    ],
  });

  const securityOperationsId = await seedEntry({
    entryType: 'TERM',
    title: 'Security Operations',
    slug: 'security-operations',
    summary:
      'Security operations is the ongoing practice of defending running systems.',
    senses: [
      {
        order: 0,
        label: 'Discipline',
        slug: 'discipline',
        definition:
          'The discipline of detecting and responding to hostile activity.',
      },
      {
        order: 1,
        label: 'Team function',
        slug: 'team-function',
        definition:
          'The organizational function staffed by defenders on rotation.',
      },
    ],
  });

  const authenticationId = await seedEntry({
    entryType: 'TERM',
    title: 'Authentication',
    slug: 'authentication',
    summary: 'Authentication establishes that a claimed identity is genuine.',
    senses: [
      {
        order: 0,
        label: 'Identity verification',
        slug: 'identity-verification',
        definition: 'Verifying a claimed identity before granting access.',
      },
    ],
  });

  const zeroTrustId = await seedEntry({
    entryType: 'TERM',
    title: 'Zero Trust',
    slug: 'zero-trust',
    summary: 'Zero trust removes implicit confidence in network location.',
    senses: [
      {
        order: 0,
        label: 'Architectural model',
        slug: 'architectural-model',
        definition:
          'Every request is evaluated on its own merits, wherever it originates.',
      },
    ],
    variants: ['Zero Trust Architecture'],
  });

  const identityTag = await prisma.tag.create({
    data: {
      name: 'Identity',
      slug: 'identity',
      description: 'Identity topics.',
    },
    select: { id: true },
  });

  await prisma.entryTag.create({
    data: {
      entryId: authenticationId,
      tagId: identityTag.id,
      assignedBy: 'EDITORIAL',
    },
  });

  return {
    socId,
    securityOperationsId,
    authenticationId,
    zeroTrustId,
    identityTagId: identityTag.id,
  };
}

const PAGE = { page: 1, pageSize: 20 };

afterAll(async () => {
  await disconnectIntegrationPrisma();
});

describe('searchPublishedEntries', () => {
  let corpus: SeededCorpus;

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    corpus = await seedCorpus();
  });

  it('ranks the exact acronym first for "SOC"', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'SOC',
      ...PAGE,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe(corpus.socId);
    expect(results[0]?.bucket).toBe(SEARCH_BUCKET.EXACT);
  });

  it('finds the acronym by its expansion via the expansion bucket', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'security operations center',
      ...PAGE,
    });

    const top2 = results.slice(0, 2);
    const soc = top2.find((row) => row.id === corpus.socId);

    expect(soc).toBeDefined();
    expect(soc?.bucket).toBe(SEARCH_BUCKET.EXPANSION_EXACT);
  });

  it('matches an entry variant', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'zero trust architecture',
      ...PAGE,
    });

    const zeroTrust = results.find((row) => row.id === corpus.zeroTrustId);
    expect(zeroTrust).toBeDefined();
    expect(zeroTrust?.bucket).toBe(SEARCH_BUCKET.EXPANSION_EXACT);
  });

  it('recovers from a misspelling through the fuzzy bucket', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'authenitcation',
      ...PAGE,
    });

    const index = results.findIndex(
      (row) => row.id === corpus.authenticationId,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(5);
    expect(results[index]?.bucket).toBe(SEARCH_BUCKET.FUZZY);
  });

  it('collapses repeated whitespace in the query', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'zero  trust',
      ...PAGE,
    });

    expect(results[0]?.id).toBe(corpus.zeroTrustId);
    expect(results[0]?.bucket).toBe(SEARCH_BUCKET.EXACT);
  });

  it('returns nothing for a bare stopword query', async () => {
    expect(
      await searchPublishedEntries(prisma, { query: 'the', ...PAGE }),
    ).toEqual([]);
    expect(
      await searchPublishedEntries(prisma, { query: '  ', ...PAGE }),
    ).toEqual([]);
    expect(await countSearchResults(prisma, { query: 'the' })).toBe(0);
  });

  it('counts the same result set that it pages over', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'security',
      page: 1,
      pageSize: 100,
    });
    const total = await countSearchResults(prisma, { query: 'security' });

    expect(total).toBe(results.length);

    const page = await searchPublishedEntriesPage(prisma, {
      query: 'security',
      page: 1,
      pageSize: 1,
    });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(total);
  });

  it('summarizes senses for term entries, not just acronyms', async () => {
    const results = await searchPublishedEntries(prisma, {
      query: 'security operations',
      ...PAGE,
    });

    const term = results.find((row) => row.id === corpus.securityOperationsId);
    expect(term?.senseCount).toBe(2);
    expect(term?.senseSummary).toBe('Discipline · Team function');

    const acronym = results.find((row) => row.id === corpus.socId);
    expect(acronym?.senseCount).toBe(2);
    expect(acronym?.senseSummary).toBe(
      'Security Operations Center · System on Chip',
    );
  });

  it('falls back to a source name when a sense has no label or expansion', async () => {
    const source = await prisma.source.create({
      data: {
        name: 'NIST CSRC Glossary',
        sourceSlug: 'nist-csrc-glossary',
        baseUrl: 'https://csrc.nist.gov/glossary',
        licenseType: 'PUBLIC_DOMAIN',
        allowedUse: 'Public information.',
        attributionRequirements: 'Source: NIST CSRC Glossary.',
        accessMethod: 'HTML',
        robotsPolicy: 'RESPECT',
        trustTier: 'TIER_1',
        enabled: true,
      },
      select: { id: true },
    });
    const document = await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: 'https://csrc.nist.gov/glossary/term/provenance',
        contentType: 'text/html',
        fetchedAt: new Date(),
        contentSha256: 'a'.repeat(64),
        snapshotAllowed: false,
      },
      select: { id: true },
    });
    const citation = await prisma.citation.create({
      data: {
        sourceId: source.id,
        sourceDocumentId: document.id,
        url: 'https://csrc.nist.gov/glossary/term/provenance',
        citationText: 'NIST CSRC Glossary',
        attributionText: 'Source: NIST CSRC Glossary.',
        accessedAt: new Date(),
      },
      select: { id: true },
    });

    const entryId = await seedEntry({
      entryType: 'TERM',
      title: 'Provenance',
      slug: 'provenance',
      summary: 'Provenance records where an assertion came from.',
      senses: [
        {
          order: 0,
          slug: 'unlabeled',
          definition: 'Where an assertion came from.',
        },
      ],
    });

    const sense = await prisma.sense.findFirstOrThrow({
      where: { entryId },
      select: { id: true },
    });
    await prisma.senseDefinition.create({
      data: {
        senseId: sense.id,
        citationId: citation.id,
        definitionMd: 'Where an assertion came from.',
        definitionText: 'Where an assertion came from.',
        isPrimary: true,
      },
    });

    const results = await searchPublishedEntries(prisma, {
      query: 'provenance',
      ...PAGE,
    });
    const provenance = results.find((row) => row.id === entryId);

    expect(provenance?.senseSummary).toBe('NIST CSRC Glossary');
  });

  it('applies the entry type filter', async () => {
    const acronyms = await searchPublishedEntries(prisma, {
      query: 'security operations',
      entryType: 'ACRONYM',
      ...PAGE,
    });

    expect(acronyms.map((row) => row.id)).toContain(corpus.socId);
    expect(acronyms.every((row) => row.entryType === 'ACRONYM')).toBe(true);

    const terms = await searchPublishedEntries(prisma, {
      query: 'security operations',
      entryType: 'TERM',
      ...PAGE,
    });

    expect(terms.map((row) => row.id)).not.toContain(corpus.socId);
    expect(terms.map((row) => row.id)).toContain(corpus.securityOperationsId);
  });

  it('applies the tag filter', async () => {
    const tagged = await searchPublishedEntries(prisma, {
      query: 'authentication',
      tagSlug: 'identity',
      ...PAGE,
    });

    expect(tagged.map((row) => row.id)).toEqual([corpus.authenticationId]);
    expect(
      await countSearchResults(prisma, {
        query: 'authentication',
        tagSlug: 'identity',
      }),
    ).toBe(1);

    const untagged = await searchPublishedEntries(prisma, {
      query: 'authentication',
      tagSlug: 'cryptography',
      ...PAGE,
    });

    expect(untagged).toEqual([]);
  });

  it('excludes entries that are not published', async () => {
    await prisma.entry.update({
      where: { id: corpus.authenticationId },
      data: { status: 'ARCHIVED' },
    });

    const results = await searchPublishedEntries(prisma, {
      query: 'authentication',
      ...PAGE,
    });
    expect(results.map((row) => row.id)).not.toContain(corpus.authenticationId);
  });
});

describe('suggestSearchCorrection', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    await seedCorpus();
  });

  it('suggests the closest indexed title for a misspelling', async () => {
    expect(
      await suggestSearchCorrection(prisma, { query: 'authenitcation' }),
    ).toBe('authentication');
  });

  it('returns null when the query is already the closest title', async () => {
    expect(
      await suggestSearchCorrection(prisma, { query: 'authentication' }),
    ).toBeNull();
  });

  it('returns null when nothing is close enough', async () => {
    expect(
      await suggestSearchCorrection(prisma, { query: 'xylophone' }),
    ).toBeNull();
  });
});
