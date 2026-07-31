import { describe, expect, it } from 'vitest';

import { parseOwaspVulnerabilityPage, vulnerabilitySlugFromUrl } from './owaspVulnerabilities.js';

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
