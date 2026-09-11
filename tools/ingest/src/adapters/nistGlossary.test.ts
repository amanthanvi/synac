import { readFileSync } from 'node:fs';

import { sourceFileSchema } from '@synac/content-tools';
import { describe, expect, it, vi } from 'vitest';

import type { SafeFetchOptions, SafeFetchResult } from '../net/safeFetch.js';
import {
  parseNistTermPage,
  runNistGlossary,
  termSlugFromUrl,
} from './nistGlossary.js';

const source = sourceFileSchema.parse({
  slug: 'nist-csrc-glossary',
  name: 'NIST CSRC Glossary',
  baseUrl: 'https://csrc.nist.gov/glossary',
  license: {
    type: 'US_GOV_PD',
    contentMode: 'QUOTED',
    allowedUse: 'Reproduce with citation.',
    attributionRequirements: 'NIST CSRC Glossary',
  },
  accessMethod: 'HTML',
  trustTier: 'TIER1',
  enabled: true,
  lastVerifiedAt: '2026-07-01',
});

const INDEX_URL = 'https://csrc.nist.gov/glossary';
const ROBOTS_URL = 'https://csrc.nist.gov/robots.txt';

function fixture(name: string): string {
  return readFileSync(
    new URL(`./__fixtures__/${name}`, import.meta.url),
    'utf8',
  );
}

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

/** csrc.nist.gov redirects /robots.txt to an HTML page, which safeFetch rejects. */
function robotsUnavailable(url: string): never {
  throw new Error(`Disallowed content-type: text/html for ${url}`);
}

describe('nist glossary term page parsing', () => {
  it('emits one sense per definition with source labels and locators', () => {
    const parsed = parseNistTermPage(fixture('nist-domain.html.txt'));

    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('domain');
    expect(parsed!.entryType).toBe('TERM');
    expect(parsed!.senses).toHaveLength(8);
    expect(parsed!.senses.map((sense) => sense.locator)).toEqual([
      '#term-def-text-0',
      '#term-def-text-1',
      '#term-def-text-2',
      '#term-def-text-3',
      '#term-def-text-4',
      '#term-def-text-5',
      '#term-def-text-6',
      '#term-def-text-7',
    ]);
    expect(parsed!.senses.map((sense) => sense.label)).toEqual([
      'CNSSI 4009-2022 under security domain',
      'NIST SP 800-53 Rev. 5',
      'NIST SP 800-137',
      'NIST SP 1800-16B',
      'NIST SP 800-160v1r1',
      'NIST SP 800-160v1r1 under security domain',
      'NIST SP 800-63-4 under security domain',
      'NISTIR 4734',
    ]);
    expect(parsed!.senses[0]!.citationText).toBe(
      'NIST CSRC Glossary, "domain" (CNSSI 4009-2022)',
    );
    expect(parsed!.senses[7]!.definitionMd).toBe(
      'A logical structure, group or sphere of influence over which control is exercised.',
    );
  });

  it('merges definitions that repeat verbatim across sources', () => {
    const html = [
      '<h3 id="term-text">replay attack</h3>',
      '<span id="term-def-text-0">An attack that resends captured data.</span>',
      '<a id="term-def-src-link-0-0" href="#">CNSSI 4009-2022</a>',
      '<span id="term-def-text-1">An attack  that resends captured data.</span>',
      '<a id="term-def-src-link-1-0" href="#">NIST SP 800-53 Rev. 5</a>',
    ].join('\n');

    const parsed = parseNistTermPage(html);
    expect(parsed!.senses).toHaveLength(1);
    expect(parsed!.senses[0]!.label).toBe('CNSSI 4009-2022');
    expect(parsed!.senses[0]!.citationText).toBe(
      'NIST CSRC Glossary, "replay attack" (CNSSI 4009-2022, also in NIST SP 800-53 Rev. 5)',
    );
  });

  it('keeps only abbreviation relations as aliases and demotes the rest', () => {
    const parsed = parseNistTermPage(fixture('nist-2fa.html.txt'));

    expect(parsed!.title).toBe('2FA');
    expect(parsed!.entryType).toBe('ACRONYM');
    expect(parsed!.aliases).toEqual([
      'Multifactor Authentication',
      'Two-Factor Authentication',
    ]);
    expect(parsed!.aliases).not.toContain('abstraction');
    expect(parsed!.seeAlso).toEqual(['abstraction']);
  });

  it('keeps an initialism variant of a multi-word title', () => {
    const html = [
      '<h3 id="term-text">Advanced Encryption Standard</h3>',
      '<a id="term-abbr-link-0" href="/glossary/term/aes">AES</a>',
      '<a id="term-abbr-link-1" href="/glossary/term/rijndael">Rijndael</a>',
      '<span id="term-def-text-0">The encryption standard specified in FIPS 197.</span>',
    ].join('\n');

    const parsed = parseNistTermPage(html);
    expect(parsed!.aliases).toEqual(['AES']);
    expect(parsed!.seeAlso).toEqual(['rijndael']);
  });

  it('classifies initialism titles as acronyms', () => {
    const html = [
      '<h3 id="term-text">TLS</h3>',
      '<span id="term-def-text-0">A protocol for protecting network traffic.</span>',
    ].join('\n');

    expect(parseNistTermPage(html)!.entryType).toBe('ACRONYM');
  });

  it('returns null when the title or definitions are missing', () => {
    expect(parseNistTermPage('<h3 id="term-text">orphan</h3>')).toBeNull();
    expect(
      parseNistTermPage('<span id="term-def-text-0">definition only</span>'),
    ).toBeNull();
  });
});

describe('nist term url natural ids', () => {
  it('derives a stable slug from the term path segment', () => {
    expect(
      termSlugFromUrl(
        'https://csrc.nist.gov/glossary/term/advanced_encryption_standard',
      ),
    ).toBe('advanced-encryption-standard');
    expect(
      termSlugFromUrl('https://csrc.nist.gov/glossary/term/Zero%20Trust'),
    ).toBe('zero-trust');
    expect(termSlugFromUrl('/glossary/term/security_domain')).toBe(
      'security-domain',
    );
  });
});

describe('nist glossary ingest', () => {
  it('numbers sense keys per definition and keys single-sense entries by term slug', async () => {
    const termUrl = 'https://csrc.nist.gov/glossary/term/domain';
    const relatedUrl = 'https://csrc.nist.gov/glossary/term/security_domain';
    const indexHtml = [
      '<a href="/glossary/term/domain">domain</a>',
      '<a href="/glossary/term/security_domain">security domain</a>',
    ].join('');
    const fetchImpl = vi.fn((options: SafeFetchOptions) => {
      if (options.url === ROBOTS_URL) robotsUnavailable(options.url);
      if (options.url === INDEX_URL) {
        return Promise.resolve(
          htmlResponse(INDEX_URL, indexHtml, 'a'.repeat(64)),
        );
      }
      if (options.url === relatedUrl) {
        return Promise.resolve(
          htmlResponse(
            relatedUrl,
            [
              '<h3 id="term-text">security domain</h3>',
              '<span id="term-def-text-0">A domain under one security policy.</span>',
            ].join(''),
            'c'.repeat(64),
          ),
        );
      }
      return Promise.resolve(
        htmlResponse(termUrl, fixture('nist-domain.html.txt'), 'b'.repeat(64)),
      );
    });

    const bundle = await runNistGlossary({
      source,
      previous: null,
      maxItems: 2,
      now: new Date('2026-07-01T00:00:00Z'),
      fetch: fetchImpl,
      minRequestDelayMs: 0,
    });

    expect(bundle.adapterVersion).toBe('nist-glossary/2.0.0');
    const entry = bundle.entries.find(
      (candidate) => candidate.slug === 'domain',
    )!;
    expect(entry.senses.map((sense) => sense.key)).toEqual([
      'domain-0',
      'domain-1',
      'domain-2',
      'domain-3',
      'domain-4',
      'domain-5',
      'domain-6',
      'domain-7',
    ]);
    expect(entry.senses[0]!.citation).toEqual({
      documentKey: 'term-domain',
      citationText: 'NIST CSRC Glossary, "domain" (CNSSI 4009-2022)',
      locator: '#term-def-text-0',
    });
    expect(entry.relationships).toEqual([
      { toType: 'TERM', toSlug: 'security-domain', type: 'SEE_ALSO' },
    ]);
    expect(entry.aliases).toEqual([]);
  });

  it('re-fetches term pages when the index document is unchanged', async () => {
    const termUrl = 'https://csrc.nist.gov/glossary/term/zero_trust';
    const indexHtml = '<a href="/glossary/term/zero_trust">Zero Trust</a>';
    const termHtml = (definition: string) =>
      `<h3 id="term-text">Zero Trust</h3><span id="term-def-text-0">${definition}</span>`;

    const fetchFor = (definition: string, sha: string) =>
      vi.fn((options: SafeFetchOptions) => {
        if (options.url === ROBOTS_URL) robotsUnavailable(options.url);
        if (options.url === INDEX_URL) {
          return Promise.resolve(
            htmlResponse(INDEX_URL, indexHtml, 'a'.repeat(64)),
          );
        }
        return Promise.resolve(
          htmlResponse(termUrl, termHtml(definition), sha),
        );
      });

    const firstFetch = fetchFor('First definition.', 'b'.repeat(64));
    const previous = await runNistGlossary({
      source,
      previous: null,
      maxItems: 1,
      now: new Date('2026-07-01T00:00:00Z'),
      fetch: firstFetch,
      minRequestDelayMs: 0,
    });

    const secondFetch = fetchFor('Corrected definition.', 'c'.repeat(64));
    const current = await runNistGlossary({
      source,
      previous,
      maxItems: 1,
      now: new Date('2026-07-02T00:00:00Z'),
      fetch: secondFetch,
      minRequestDelayMs: 0,
    });

    expect(current.entries[0]?.senses[0]?.definitionMd).toBe(
      'Corrected definition.',
    );
    expect(current.entries[0]?.senses[0]?.key).toBe('zero-trust');
    // robots.txt, index, term page.
    expect(firstFetch).toHaveBeenCalledTimes(3);
    expect(secondFetch).toHaveBeenCalledTimes(3);
  });

  it('fetches terms concurrently while preserving discovery-order dedupe and concise progress', async () => {
    const termUrls = Array.from(
      { length: 10 },
      (_, index) => `https://csrc.nist.gov/glossary/term/term_${index + 1}`,
    );
    const indexHtml = termUrls
      .map(
        (url, index) =>
          `<a href="${new URL(url).pathname}">Term ${index + 1}</a>`,
      )
      .join('');
    let active = 0;
    let maxActive = 0;
    const completionOrder: number[] = [];
    const messages: string[] = [];
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((message: string) => {
        messages.push(message);
      });

    const fetchImpl = vi.fn(async (options: SafeFetchOptions) => {
      if (options.url === ROBOTS_URL) robotsUnavailable(options.url);
      if (options.url === INDEX_URL)
        return htmlResponse(INDEX_URL, indexHtml, 'a'.repeat(64));

      const termNumber = Number(new URL(options.url).pathname.split('_').pop());
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) =>
        setTimeout(resolve, (11 - termNumber) * 4),
      );
      completionOrder.push(termNumber);
      active -= 1;

      const title = termNumber <= 2 ? 'Shared Term' : `Term ${termNumber}`;
      const html = [
        `<h3 id="term-text">${title}</h3>`,
        `<span id="term-def-text-0">Definition ${termNumber}.</span>`,
      ].join('');
      return htmlResponse(
        options.url,
        html,
        String(termNumber).padStart(64, '0'),
      );
    });

    try {
      const bundle = await runNistGlossary({
        source,
        previous: null,
        maxItems: termUrls.length,
        now: new Date('2026-07-01T00:00:00Z'),
        fetch: fetchImpl,
        minRequestDelayMs: 0,
      });

      expect(maxActive).toBe(8);
      expect(completionOrder[0]).toBe(8);
      expect(
        fetchImpl.mock.calls.slice(2).map(([options]) => options.url),
      ).toEqual(termUrls);
      expect(
        bundle.entries.find((entry) => entry.slug === 'shared-term')?.senses[0]
          ?.key,
      ).toBe('term-1');
      expect(messages).toEqual([
        '[nist-glossary] fetching 10 term pages (concurrency 8)',
        '[nist-glossary] fetched 10/10 term pages',
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it('drains in-flight term fetches before propagating the first failure', async () => {
    const termUrls = Array.from(
      { length: 10 },
      (_, index) => `https://csrc.nist.gov/glossary/term/term_${index + 1}`,
    );
    const indexHtml = termUrls
      .map((url) => `<a href="${new URL(url).pathname}">Term</a>`)
      .join('');
    let rejectFirst: (error: Error) => void = () => undefined;
    const firstFetch = new Promise<SafeFetchResult>((_, reject) => {
      rejectFirst = reject;
    });
    const releaseInFlight: Array<() => void> = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const fetchImpl = vi.fn((options: SafeFetchOptions) => {
      if (options.url === ROBOTS_URL) robotsUnavailable(options.url);
      if (options.url === INDEX_URL) {
        return Promise.resolve(
          htmlResponse(INDEX_URL, indexHtml, 'a'.repeat(64)),
        );
      }
      if (options.url === termUrls[0]) return firstFetch;

      return new Promise<SafeFetchResult>((resolve) => {
        releaseInFlight.push(() =>
          resolve(
            htmlResponse(
              options.url,
              '<h3 id="term-text">Term</h3>',
              'b'.repeat(64),
            ),
          ),
        );
      });
    });

    try {
      const run = runNistGlossary({
        source,
        previous: null,
        maxItems: termUrls.length,
        now: new Date('2026-07-01T00:00:00Z'),
        fetch: fetchImpl,
        minRequestDelayMs: 0,
      });
      let outcome: 'pending' | 'fulfilled' | 'rejected' = 'pending';
      void run.then(
        () => {
          outcome = 'fulfilled';
        },
        () => {
          outcome = 'rejected';
        },
      );

      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(10));
      rejectFirst(new Error('term fetch failed'));
      await Promise.resolve();
      await Promise.resolve();

      expect(outcome).toBe('pending');
      for (const release of releaseInFlight) release();

      await expect(run).rejects.toThrow('term fetch failed');
      expect(fetchImpl).toHaveBeenCalledTimes(10);
    } finally {
      for (const release of releaseInFlight) release();
      log.mockRestore();
    }
  });
});
