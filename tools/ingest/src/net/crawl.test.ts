import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCrawler, isPathAllowed, parseRobotsTxt } from './crawl.js';
import type { SafeFetchOptions, SafeFetchResult } from './safeFetch.js';

function response(url: string, body: string, status = 200): SafeFetchResult {
  return {
    url,
    status,
    contentType: 'text/plain',
    etag: null,
    lastModified: null,
    body: Buffer.from(body),
    sha256: 'a'.repeat(64),
  };
}

const PAGE_OPTIONS = {
  allowedHosts: ['example.gov'],
  allowedContentTypePrefixes: ['text/html'],
  maxRedirects: 3,
  timeoutMs: 1000,
  maxBytes: 1024,
} satisfies Omit<SafeFetchOptions, 'url'>;

afterEach(() => {
  vi.useRealTimers();
});

describe('parseRobotsTxt', () => {
  it('reads the wildcard group and ignores other agents', () => {
    const robots = parseRobotsTxt(
      [
        'User-agent: BadBot',
        'Disallow: /',
        '',
        'User-agent: *',
        '# comment',
        'Disallow: /private',
        'Allow: /private/public',
        'Crawl-delay: 2',
        '',
        'User-agent: OtherBot',
        'Crawl-delay: 60',
      ].join('\n'),
    );

    expect(robots.rules).toEqual([
      { allow: false, path: '/private' },
      { allow: true, path: '/private/public' },
    ]);
    expect(robots.crawlDelayMs).toBe(2000);
  });

  it('treats an empty Disallow as no restriction', () => {
    expect(parseRobotsTxt('User-agent: *\nDisallow:').rules).toEqual([]);
  });
});

describe('isPathAllowed', () => {
  it('lets the longest matching rule win, with allow breaking ties', () => {
    const robots = parseRobotsTxt(
      ['User-agent: *', 'Disallow: /glossary', 'Allow: /glossary/term/'].join(
        '\n',
      ),
    );

    expect(isPathAllowed(robots, '/glossary/term/domain')).toBe(true);
    expect(isPathAllowed(robots, '/glossary?index=A')).toBe(false);
    expect(isPathAllowed(robots, '/about')).toBe(true);
  });

  it('supports wildcard and end-of-path patterns', () => {
    const robots = parseRobotsTxt(
      ['User-agent: *', 'Disallow: /*.pdf$'].join('\n'),
    );

    expect(isPathAllowed(robots, '/docs/report.pdf')).toBe(false);
    expect(isPathAllowed(robots, '/docs/report.pdf.html')).toBe(true);
  });
});

describe('createCrawler', () => {
  it('refuses paths the wildcard group disallows', async () => {
    const fetchImpl = vi.fn((options: SafeFetchOptions) =>
      Promise.resolve(
        options.url.endsWith('/robots.txt')
          ? response(options.url, 'User-agent: *\nDisallow: /glossary')
          : response(options.url, '<html></html>'),
      ),
    );
    const crawler = createCrawler({
      userAgent: 'test',
      fetchImpl,
      minDelayMs: 0,
    });

    await expect(
      crawler.fetch({
        ...PAGE_OPTIONS,
        url: 'https://example.gov/glossary/term/domain',
      }),
    ).rejects.toThrow('Blocked by robots.txt');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('crawls when robots.txt is unreadable', async () => {
    const fetchImpl = vi.fn((options: SafeFetchOptions) => {
      if (options.url.endsWith('/robots.txt'))
        throw new Error('Disallowed content-type: text/html');
      return Promise.resolve(response(options.url, '<html></html>'));
    });
    const crawler = createCrawler({
      userAgent: 'test',
      fetchImpl,
      minDelayMs: 0,
    });

    const res = await crawler.fetch({
      ...PAGE_OPTIONS,
      url: 'https://example.gov/glossary',
    });
    expect(res.status).toBe(200);
  });

  it('paces concurrent request starts per host and fetches robots.txt once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const starts: number[] = [];
    const fetchImpl = vi.fn((options: SafeFetchOptions) => {
      if (options.url.endsWith('/robots.txt'))
        return Promise.resolve(response(options.url, '', 404));
      starts.push(Date.now());
      return Promise.resolve(response(options.url, '<html></html>'));
    });
    const crawler = createCrawler({
      userAgent: 'test',
      fetchImpl,
      minDelayMs: 250,
    });

    const pending = Promise.all(
      ['a', 'b', 'c'].map((slug) =>
        crawler.fetch({
          ...PAGE_OPTIONS,
          url: `https://example.gov/glossary/term/${slug}`,
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(600);
    await pending;

    expect(starts).toEqual([0, 250, 500]);
    expect(
      fetchImpl.mock.calls.filter(([o]) => o.url.endsWith('/robots.txt')),
    ).toHaveLength(1);
  });

  it('honors a Crawl-delay larger than the configured minimum', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const starts: number[] = [];
    const fetchImpl = vi.fn((options: SafeFetchOptions) => {
      if (options.url.endsWith('/robots.txt')) {
        return Promise.resolve(
          response(options.url, 'User-agent: *\nCrawl-delay: 1'),
        );
      }
      starts.push(Date.now());
      return Promise.resolve(response(options.url, '<html></html>'));
    });
    const crawler = createCrawler({
      userAgent: 'test',
      fetchImpl,
      minDelayMs: 250,
    });

    const pending = Promise.all(
      ['a', 'b'].map((slug) =>
        crawler.fetch({
          ...PAGE_OPTIONS,
          url: `https://example.gov/glossary/term/${slug}`,
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(1500);
    await pending;

    expect(starts).toEqual([0, 1000]);
  });
});
