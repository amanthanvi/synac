import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADAPTER_SLUG,
  ADAPTER_VERSION,
  extractOverviewParagraph,
  extractOwaspTitle,
  owaspVulnerabilitiesAdapter,
} from './owaspVulnerabilities.js';

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
);
const html = readFileSync(
  path.join(fixtures, 'owaspVulnerability.html'),
  'utf8',
);

describe('extractOwaspTitle', () => {
  it('reads the page title from an h1 carrying the page-title class token', () => {
    expect(extractOwaspTitle(html)).toBe('SQL Injection');
  });

  it('returns null when there is no page-title heading', () => {
    expect(
      extractOwaspTitle('<html><body><h1>Other</h1></body></html>'),
    ).toBeNull();
  });

  it('returns null when the heading is empty', () => {
    expect(extractOwaspTitle('<h1 class="page-title">   </h1>')).toBeNull();
  });
});

describe('extractOverviewParagraph', () => {
  it('takes the first paragraph under the Overview heading', () => {
    expect(extractOverviewParagraph(html)).toBe(
      'A SQL injection attack consists of insertion or "injection" of a SQL query via the input data from the client to the application.',
    );
  });

  it('stops at the next h2 rather than bleeding into the following section', () => {
    const overview = extractOverviewParagraph(html);
    expect(overview).not.toContain('Input validation');
  });

  it('returns null when there is no Overview heading', () => {
    expect(
      extractOverviewParagraph('<h2 id="details">Details</h2><p>Body.</p>'),
    ).toBeNull();
  });

  it('returns null when the Overview section has no paragraph', () => {
    expect(
      extractOverviewParagraph(
        '<h2 id="overview">Overview</h2><h2 id="next">Next</h2>',
      ),
    ).toBeNull();
  });

  it('returns null when the paragraph is only whitespace', () => {
    expect(
      extractOverviewParagraph('<h2 id="overview">Overview</h2><p>  </p>'),
    ).toBeNull();
  });
});

describe('owaspVulnerabilitiesAdapter', () => {
  it('registers under the OWASP source slug with a pinned adapter version', () => {
    expect(owaspVulnerabilitiesAdapter.slug).toBe(ADAPTER_SLUG);
    expect(ADAPTER_SLUG).toBe('owasp-vulnerabilities');
    expect(owaspVulnerabilitiesAdapter.version).toBe(ADAPTER_VERSION);
  });
});
