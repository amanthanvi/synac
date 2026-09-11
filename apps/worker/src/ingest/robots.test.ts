import { describe, expect, it } from 'vitest';

import { isPathAllowedByRules, parseRobotsTxt } from './robots.js';

// Pure-function coverage only: `isUrlAllowedByRobots` is the only networked entry point and
// it delegates parsing/matching to the two functions exercised here.

describe('parseRobotsTxt', () => {
  it('picks the `*` group out of a multi-group file', () => {
    const text = [
      'User-agent: BadBot',
      'Disallow: /',
      '',
      'User-agent: *',
      'Disallow: /private/',
      'Allow: /private/public/',
      '',
      'User-agent: OtherBot',
      'Disallow: /other/',
    ].join('\n');

    expect(parseRobotsTxt(text)).toEqual({
      allow: ['/private/public/'],
      disallow: ['/private/'],
    });
  });

  it('lets a named-agent group override `*`', () => {
    const text = [
      'User-agent: *',
      'Disallow: /everything/',
      '',
      'User-agent: synac-worker',
      'Disallow: /just-this/',
    ].join('\n');

    expect(parseRobotsTxt(text, 'synac-worker')).toEqual({
      allow: [],
      disallow: ['/just-this/'],
    });
    expect(parseRobotsTxt(text)).toEqual({
      allow: [],
      disallow: ['/everything/'],
    });
  });

  it('matches the named agent case-insensitively', () => {
    const text = [
      'User-agent: *',
      'Disallow: /a/',
      '',
      'User-Agent: SynAc-Worker',
      'Disallow: /b/',
    ].join('\n');
    expect(parseRobotsTxt(text, 'synac-worker').disallow).toEqual(['/b/']);
  });

  it('treats a named group of only `Disallow:` as an allow-all override of `*`', () => {
    const text = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: synac-worker',
      'Disallow:',
    ].join('\n');
    const rules = parseRobotsTxt(text, 'synac-worker');
    expect(rules).toEqual({ allow: [], disallow: [] });
    expect(isPathAllowedByRules(rules, '/anything')).toBe(true);
  });

  it('applies rules to every agent in a consecutive User-agent block', () => {
    const text = [
      'User-agent: *',
      'User-agent: synac-worker',
      'Disallow: /shared/',
    ].join('\n');
    expect(parseRobotsTxt(text).disallow).toEqual(['/shared/']);
    expect(parseRobotsTxt(text, 'synac-worker').disallow).toEqual(['/shared/']);
  });

  it('treats an empty Disallow value as allow-all', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow:');
    expect(rules).toEqual({ allow: [], disallow: [] });
    expect(isPathAllowedByRules(rules, '/anything/at/all')).toBe(true);
  });

  it('ignores comments, blank lines and unknown directives', () => {
    const text = [
      '# leading comment',
      '',
      'Sitemap: https://example.com/sitemap.xml',
      'User-agent: *   # inline comment',
      'Crawl-delay: 10',
      '',
      'Disallow: /admin/ # keep out',
      'Host: example.com',
      'Allow: /admin/ok/',
      'this line has no colon',
    ].join('\n');

    expect(parseRobotsTxt(text)).toEqual({
      allow: ['/admin/ok/'],
      disallow: ['/admin/'],
    });
  });

  it('is case-insensitive on directive names', () => {
    const rules = parseRobotsTxt('USER-AGENT: *\nDISALLOW: /x/\nALLOW: /x/y/');
    expect(rules).toEqual({ allow: ['/x/y/'], disallow: ['/x/'] });
  });

  it('allows everything for an empty or garbage file', () => {
    for (const text of [
      '',
      '   \n\n',
      '# only a comment',
      'not robots txt at all',
    ]) {
      const rules = parseRobotsTxt(text);
      expect(rules).toEqual({ allow: [], disallow: [] });
      expect(isPathAllowedByRules(rules, '/whatever')).toBe(true);
    }
  });

  it('ignores rules that appear before any User-agent line', () => {
    expect(
      parseRobotsTxt('Disallow: /orphan/\nUser-agent: *\nDisallow: /real/'),
    ).toEqual({
      allow: [],
      disallow: ['/real/'],
    });
  });
});

describe('isPathAllowedByRules', () => {
  it('allows paths with no matching disallow', () => {
    const rules = { allow: [], disallow: ['/private/'] };
    expect(isPathAllowedByRules(rules, '/public/page')).toBe(true);
  });

  it('disallows a matching prefix', () => {
    const rules = { allow: [], disallow: ['/private/'] };
    expect(isPathAllowedByRules(rules, '/private/page')).toBe(false);
  });

  it('lets a longer Allow beat a shorter Disallow', () => {
    const rules = { allow: ['/private/public/'], disallow: ['/private/'] };
    expect(isPathAllowedByRules(rules, '/private/public/page')).toBe(true);
    expect(isPathAllowedByRules(rules, '/private/secret/page')).toBe(false);
  });

  it('lets an equal-length Allow win', () => {
    const rules = { allow: ['/x/'], disallow: ['/x/'] };
    expect(isPathAllowedByRules(rules, '/x/y')).toBe(true);
  });

  it('honours a trailing `*` wildcard', () => {
    const rules = { allow: [], disallow: ['/a/*/secret'] };
    expect(isPathAllowedByRules(rules, '/a/b/secret')).toBe(false);
    expect(isPathAllowedByRules(rules, '/a/b/public')).toBe(true);
  });

  it('honours a `$` end anchor', () => {
    const rules = { allow: [], disallow: ['/exact$'] };
    expect(isPathAllowedByRules(rules, '/exact')).toBe(false);
    expect(isPathAllowedByRules(rules, '/exact/more')).toBe(true);
  });

  it('allows everything when both lists are empty', () => {
    expect(isPathAllowedByRules({ allow: [], disallow: [] }, '/')).toBe(true);
  });
});
