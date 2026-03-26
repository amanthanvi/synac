import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createIntegrationTestClient, resetIntegrationDatabase } from '@synac/db';

import { logger } from '@/lib/logger';

import { GET } from './route';

async function waitForCoverageAuditLog(infoSpy: { mock: { calls: unknown[][] } }): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (infoSpy.mock.calls.some((call) => call[0] === 'search.index.coverage')) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for search.index.coverage log');
}

async function settleDeferredSearchWork(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setTimeout(r, 100));
}

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

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const request = new NextRequest('http://localhost:3000/api/v1/search?q=saml&page=1', {
      headers: { 'user-agent': 'vitest-search-route' },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(1);
    await settleDeferredSearchWork();
    expect(infoSpy.mock.calls.some((call) => call[0] === 'search.index.coverage')).toBe(false);
  });

  it('emits search-index coverage diagnostics only for anomalous searches with real missing index rows', async () => {
    const entry = await createPublishedEntry({
      slug: 'authentication',
      title: 'Authentication',
      summary: 'Authentication verifies an identity.',
      definition: 'Authentication verifies an identity before access.',
    });

    await prisma.entrySearch.deleteMany({ where: { entryId: entry.id } });

    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
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
    await waitForCoverageAuditLog(infoSpy);
    expect(infoSpy).toHaveBeenCalledWith(
      'search.index.coverage',
      expect.objectContaining({ location: 'api_v1_search' }),
    );
  });
});
