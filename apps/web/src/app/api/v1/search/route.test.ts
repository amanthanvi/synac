import { describe, expect, it, vi } from 'vitest';

vi.mock('@synac/db', () => ({
  getPrismaClient: vi.fn(),
  getSearchIndexCoverage: vi.fn(),
  searchPublishedEntries: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  enforceRateLimit: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  shouldAuditSearchIndexCoverage: vi.fn(),
  logSearchIndexCoverage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  getSearchIndexCoverage,
  searchPublishedEntries,
} from '@synac/db';

import { shouldAuditSearchIndexCoverage } from '@/lib/observability';
import { enforceRateLimit } from '@/lib/rateLimit';

import { GET } from './route';

describe('GET /api/v1/search', () => {
  it('does not inspect search index coverage for normal autocomplete traffic', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 59,
    });
    vi.mocked(searchPublishedEntries).mockResolvedValue([]);
    vi.mocked(shouldAuditSearchIndexCoverage).mockReturnValue(false);

    const request = new Request('http://localhost:3000/api/v1/search?q=saml&page=1');
    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expect(searchPublishedEntries).toHaveBeenCalledOnce();
    expect(shouldAuditSearchIndexCoverage).toHaveBeenCalledOnce();
    expect(getSearchIndexCoverage).not.toHaveBeenCalled();
  });

  it('inspects search index coverage only when anomaly gating says so', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 59,
    });
    vi.mocked(searchPublishedEntries).mockResolvedValue([]);
    vi.mocked(shouldAuditSearchIndexCoverage).mockReturnValue(true);
    vi.mocked(getSearchIndexCoverage).mockResolvedValue({
      publishedEntries: 10,
      indexedEntries: 9,
      missingEntryIds: ['entry-1'],
      orphanedEntryIds: [],
    });

    const request = new Request(
      'http://localhost:3000/api/v1/search?q=authentication&page=1',
    );
    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expect(getSearchIndexCoverage).toHaveBeenCalledOnce();
  });
});
