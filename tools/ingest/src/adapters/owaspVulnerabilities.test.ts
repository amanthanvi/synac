import { sourceFileSchema } from '@synac/content-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../net/safeFetch.js', () => ({ safeFetch: vi.fn() }));

import { safeFetch } from '../net/safeFetch.js';
import {
  parseOwaspVulnerabilityPage,
  runOwaspVulnerabilities,
  vulnerabilitySlugFromUrl,
} from './owaspVulnerabilities.js';

beforeEach(() => {
  vi.mocked(safeFetch).mockReset();
});

function htmlResponse(url: string, body: string, sha256: string) {
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
      parseOwaspVulnerabilityPage('<h2 id="overview">Overview</h2><p>orphan overview</p>'),
    ).toBeNull();
    expect(parseOwaspVulnerabilityPage('<h1 class="page-title">No Overview</h1>')).toBeNull();
  });
});

describe('owasp page url natural ids', () => {
  it('derives a stable slug from the vulnerability path segment', () => {
    expect(
      vulnerabilitySlugFromUrl('https://owasp.org/www-community/vulnerabilities/SQL_Injection'),
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
        allowedUse: 'Reproduce and adapt with attribution.',
        attributionRequirements: 'OWASP Foundation',
      },
      accessMethod: 'HTML',
      trustTier: 'TIER2',
      enabled: true,
      lastVerifiedAt: '2026-07-01',
    });
    const indexUrl = 'https://owasp.org/www-community/vulnerabilities';
    const pageUrl = 'https://owasp.org/www-community/vulnerabilities/SQL_Injection';
    const indexHtml = '<a href="/www-community/vulnerabilities/SQL_Injection">SQL Injection</a>';
    const pageHtml = (overview: string) =>
      `<h1 class="page-title">SQL Injection</h1><h2 id="overview">Overview</h2><p>${overview}</p>`;

    vi.mocked(safeFetch)
      .mockResolvedValueOnce(htmlResponse(indexUrl, indexHtml, 'a'.repeat(64)))
      .mockResolvedValueOnce(htmlResponse(pageUrl, pageHtml('First overview.'), 'b'.repeat(64)));
    const previous = await runOwaspVulnerabilities({
      source,
      previous: null,
      maxItems: 1,
      now: new Date('2026-07-01T00:00:00Z'),
    });

    vi.mocked(safeFetch)
      .mockResolvedValueOnce(htmlResponse(indexUrl, indexHtml, 'a'.repeat(64)))
      .mockResolvedValueOnce(htmlResponse(pageUrl, pageHtml('Corrected overview.'), 'c'.repeat(64)));
    const current = await runOwaspVulnerabilities({
      source,
      previous,
      maxItems: 1,
      now: new Date('2026-07-02T00:00:00Z'),
    });

    expect(current.entries[0]?.senses[0]?.definitionMd).toBe('Corrected overview.');
    expect(safeFetch).toHaveBeenCalledTimes(4);
  });
});
