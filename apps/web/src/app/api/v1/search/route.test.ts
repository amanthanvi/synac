import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createIntegrationTestClient, resetIntegrationDatabase } from '@synac/db';

import { GET } from './route';

const prisma = createIntegrationTestClient();

async function createPublishedEntry(input: {
  slug: string;
  title: string;
  summary: string;
  definition: string;
}) {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: input.title,
      normalizedTitle: input.title.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: input.summary,
      summaryText: input.summary,
    },
    select: { id: true },
  });

  await prisma.sense.create({
    data: {
      entryId: entry.id,
      senseOrder: 0,
      definitionMd: input.definition,
      definitionText: input.definition,
      status: 'PUBLISHED',
    },
  });

  return entry;
}

describe('GET /api/v1/search integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('does not emit search-index coverage diagnostics for normal autocomplete traffic', async () => {
    await createPublishedEntry({
      slug: 'saml',
      title: 'SAML',
      summary: 'Security Assertion Markup Language.',
      definition: 'SAML is used for federated authentication.',
    });

    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = new NextRequest('http://localhost:3000/api/v1/search?q=saml&page=1', {
      headers: { 'user-agent': 'vitest-search-route' },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(1);
    expect(
      infoSpy.mock.calls.some(([value]) =>
        String(value).includes('"message":"search.index.coverage"'),
      ),
    ).toBe(false);
  });

  it('emits search-index coverage diagnostics only for anomalous searches with real missing index rows', async () => {
    const entry = await createPublishedEntry({
      slug: 'authentication',
      title: 'Authentication',
      summary: 'Authentication verifies an identity.',
      definition: 'Authentication verifies an identity before access.',
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: entry.id } });

    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = new NextRequest(
      'http://localhost:3000/api/v1/search?q=authentication&page=1',
      {
        headers: { 'user-agent': 'vitest-search-route-anomaly' },
      },
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(0);
    expect(
      infoSpy.mock.calls.some(([value]) =>
        String(value).includes('"message":"search.index.coverage"'),
      ),
    ).toBe(true);
  });
});
