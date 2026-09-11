import { sourceFileSchema } from '@synac/content-tools';
import { describe, expect, it, vi } from 'vitest';

import type { SafeFetchOptions, SafeFetchResult } from '../net/safeFetch.js';
import {
  parseOwaspVulnerabilityPage,
  runOwaspVulnerabilities,
  vulnerabilitySlugFromUrl,
} from './owaspVulnerabilities.js';

function htmlResponse(
  url: string,
  body: string,
  sha256: string,
): SafeFetchResult {
  return {
    url,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    etag: null,
    lastModified: null,
    body: Buffer.from(body),
    sha256,
  };
}

describe('owasp vulnerability page parsing', () => {
  it('parses the page title and the first overview paragraph', () => {
    const html = [
      '<html><body>',
      '<h1 class="page-title">SQL Injection</h1>',
      '<h2 id="overview">Overview</h2>',
      '<p>A SQL injection attack consists of insertion or &quot;injection&quot; of a SQL query',
      '  via the input data from the client to the application.</p>',
      '<p>A second paragraph that should be ignored.</p>',
      '<h2 id="risk-factors">Risk Factors</h2>',
      '<p>Not part of the overview.</p>',
      '</body></html>',
    ].join('\n');

    const parsed = parseOwaspVulnerabilityPage(html);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('SQL Injection');
    expect(parsed!.overviewMd).toBe(
      'A SQL injection attack consists of insertion or "injection" of a SQL query via the input data from the client to the application.',
    );
  });

  it('returns null when the title or overview section is missing', () => {
    expect(
      parseOwaspVulnerabilityPage(
        '<h2 id="overview">Overview</h2><p>orphan overview</p>',
      ),
    ).toBeNull();
    expect(
      parseOwaspVulnerabilityPage('<h1 class="page-title">No Overview</h1>'),
    ).toBeNull();
  });
});

describe('owasp page url natural ids', () => {
  it('derives a stable slug from the vulnerability path segment', () => {
    expect(
      vulnerabilitySlugFromUrl(
        'https://owasp.org/www-community/vulnerabilities/SQL_Injection',
      ),
    ).toBe('sql-injection');
  });
});

describe('owasp vulnerability ingest freshness', () => {
  it('re-fetches vulnerability pages when the index document is unchanged', async () => {
    const source = sourceFileSchema.parse({
      slug: 'owasp-vulnerabilities',
      name: 'OWASP Community Vulnerabilities',
      baseUrl: 'https://owasp.org/www-community/vulnerabilities/',
      license: {
        type: 'CC_BY_SA_4_0',
        contentMode: 'QUOTED',
        allowedUse: 'Reproduce and adapt with attribution.',
        attributionRequirements: 'OWASP Foundation',
      },
      accessMethod: 'HTML',
      trustTier: 'TIER2',
      enabled: true,
      lastVerifiedAt: '2026-07-01',
    });
    const indexUrl = 'https://owasp.org/www-community/vulnerabilities';
    const pageUrl =
      'https://owasp.org/www-community/vulnerabilities/SQL_Injection';
    const indexHtml =
      '<a href="/www-community/vulnerabilities/SQL_Injection">SQL Injection</a>';
    const pageHtml = (overview: string) =>
      `<h1 class="page-title">SQL Injection</h1><h2 id="overview">Overview</h2><p>${overview}</p>`;

    const fetchFor = (overview: string, sha: string) =>
      vi.fn((options: SafeFetchOptions) =>
        Promise.resolve(
          options.url === indexUrl
            ? htmlResponse(indexUrl, indexHtml, 'a'.repeat(64))
            : htmlResponse(pageUrl, pageHtml(overview), sha),
        ),
      );

    const firstFetch = fetchFor('First overview.', 'b'.repeat(64));
    const previous = await runOwaspVulnerabilities({
      source,
      previous: null,
      maxItems: 1,
      now: new Date('2026-07-01T00:00:00Z'),
      fetch: firstFetch,
    });

    const secondFetch = fetchFor('Corrected overview.', 'c'.repeat(64));
    const current = await runOwaspVulnerabilities({
      source,
      previous,
      maxItems: 1,
      now: new Date('2026-07-02T00:00:00Z'),
      fetch: secondFetch,
    });

    expect(current.entries[0]?.senses[0]?.definitionMd).toBe(
      'Corrected overview.',
    );
    expect(firstFetch).toHaveBeenCalledTimes(2);
    expect(secondFetch).toHaveBeenCalledTimes(2);
  });
});

describe('owasp vulnerability conditional requests', () => {
  it('replays recorded validators and reuses the previous entry on a 304', async () => {
    const source = sourceFileSchema.parse({
      slug: 'owasp-vulnerabilities',
      name: 'OWASP Community Vulnerabilities',
      baseUrl: 'https://owasp.org/www-community/vulnerabilities/',
      license: {
        type: 'CC_BY_SA_4_0',
        contentMode: 'QUOTED',
        allowedUse: 'Reproduce and adapt with attribution.',
        attributionRequirements: 'OWASP Foundation',
      },
      accessMethod: 'HTML',
      trustTier: 'TIER2',
      enabled: true,
      lastVerifiedAt: '2026-07-01',
    });
    const indexUrl = 'https://owasp.org/www-community/vulnerabilities';
    const pageUrl =
      'https://owasp.org/www-community/vulnerabilities/SQL_Injection';
    const indexHtml =
      '<a href="/www-community/vulnerabilities/SQL_Injection">SQL Injection</a>';
    const pageHtml =
      '<h1 class="page-title">SQL Injection</h1><h2 id="overview">Overview</h2><p>First overview.</p>';

    const firstFetch = vi.fn((options: SafeFetchOptions) =>
      Promise.resolve(
        options.url === indexUrl
          ? htmlResponse(indexUrl, indexHtml, 'a'.repeat(64))
          : {
              ...htmlResponse(pageUrl, pageHtml, 'b'.repeat(64)),
              etag: 'W/"v1"',
              lastModified: 'Tue, 01 Jul 2026 00:00:00 GMT',
            },
      ),
    );
    const previous = await runOwaspVulnerabilities({
      source,
      previous: null,
      maxItems: 1,
      now: new Date('2026-07-01T00:00:00Z'),
      fetch: firstFetch,
    });
    expect(previous.documents[1]).toMatchObject({
      etag: 'W/"v1"',
      lastModified: 'Tue, 01 Jul 2026 00:00:00 GMT',
    });

    const secondFetch = vi.fn((options: SafeFetchOptions) =>
      Promise.resolve(
        options.url === indexUrl
          ? htmlResponse(indexUrl, indexHtml, 'a'.repeat(64))
          : {
              ...htmlResponse(pageUrl, '', 'd'.repeat(64)),
              status: 304,
              etag: 'W/"v1"',
            },
      ),
    );
    const current = await runOwaspVulnerabilities({
      source,
      previous,
      maxItems: 1,
      now: new Date('2026-07-02T00:00:00Z'),
      fetch: secondFetch,
    });

    const pageRequest = secondFetch.mock.calls
      .map(([options]) => options)
      .find((options) => options.url === pageUrl);
    expect(pageRequest?.headers).toMatchObject({
      'if-none-match': 'W/"v1"',
      'if-modified-since': 'Tue, 01 Jul 2026 00:00:00 GMT',
    });
    expect(
      secondFetch.mock.calls.map(
        ([options]) => options.headers?.['if-none-match'],
      ),
    ).toContain(undefined);
    expect(current.entries).toEqual(previous.entries);
    expect(current.documents).toEqual(previous.documents);
  });
});
