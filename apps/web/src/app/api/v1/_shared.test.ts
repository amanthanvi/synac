import { describe, expect, test } from 'vitest';

import {
  computeEtag,
  etagSatisfies,
  jsonResponse,
  parseLetter,
  parsePage,
  parsePageSize,
  parseSlug,
} from './_shared';

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request('https://synac.app/api/v1/tags', { headers });
}

describe('computeEtag', () => {
  test('is stable for the same body', () => {
    const body = JSON.stringify({ results: [1, 2, 3] });
    expect(computeEtag(body)).toBe(computeEtag(body));
  });

  test('differs for different bodies', () => {
    expect(computeEtag('{"a":1}')).not.toBe(computeEtag('{"a":2}'));
  });

  test('is a quoted sha1 hex digest', () => {
    expect(computeEtag('{}')).toMatch(/^"[0-9a-f]{40}"$/);
  });
});

describe('etagSatisfies', () => {
  const etag = computeEtag('{"a":1}');

  test('matches an exact tag, a list member, a weak form, and *', () => {
    expect(etagSatisfies(etag, etag)).toBe(true);
    expect(etagSatisfies(`"other", ${etag}`, etag)).toBe(true);
    expect(etagSatisfies(`W/${etag}`, etag)).toBe(true);
    expect(etagSatisfies('*', etag)).toBe(true);
  });

  test('does not match a missing or different tag', () => {
    expect(etagSatisfies(null, etag)).toBe(false);
    expect(etagSatisfies('"nope"', etag)).toBe(false);
  });
});

describe('jsonResponse', () => {
  const body = { results: [{ slug: 'phishing' }] };

  test('sends the body with caching headers and an ETag', async () => {
    const response = jsonResponse(requestWith(), body);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    );
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('etag')).toBe(
      computeEtag(JSON.stringify(body)),
    );
    expect(await response.json()).toEqual(body);
  });

  test('replays as 304 with the same headers when If-None-Match matches', async () => {
    const first = jsonResponse(requestWith(), body);
    const etag = first.headers.get('etag') ?? '';

    const replay = jsonResponse(requestWith({ 'if-none-match': etag }), body);
    expect(replay.status).toBe(304);
    expect(replay.headers.get('etag')).toBe(etag);
    expect(replay.headers.get('cache-control')).toBe(
      first.headers.get('cache-control'),
    );
    expect(await replay.text()).toBe('');
  });

  test('still sends the body when If-None-Match is a stale tag', () => {
    const response = jsonResponse(
      requestWith({ 'if-none-match': computeEtag('stale') }),
      body,
    );
    expect(response.status).toBe(200);
  });
});

describe('query parameter parsers', () => {
  test('parsePage clamps to the allowed range', () => {
    expect(parsePage(null, 10)).toBe(1);
    expect(parsePage('3', 10)).toBe(3);
    expect(parsePage('0', 10)).toBe(1);
    expect(parsePage('999', 10)).toBe(10);
    expect(parsePage('nonsense', 10)).toBe(1);
  });

  test('parsePageSize falls back and clamps', () => {
    expect(parsePageSize(null, 50, 100)).toBe(50);
    expect(parsePageSize('', 50, 100)).toBe(50);
    expect(parsePageSize('25', 50, 100)).toBe(25);
    expect(parsePageSize('5000', 50, 100)).toBe(100);
  });

  test('parseLetter accepts a-z and 0-9 and falls back to a', () => {
    expect(parseLetter('Q')).toBe('q');
    expect(parseLetter('0-9')).toBe('0-9');
    expect(parseLetter('zz')).toBe('a');
    expect(parseLetter(null)).toBe('a');
  });

  test('parseSlug accepts corpus slugs and rejects the rest', () => {
    expect(parseSlug('black-box-testing')).toBe('black-box-testing');
    expect(parseSlug('0x')).toBe('0x');
    expect(parseSlug(' BLACK ')).toBe('black');
    expect(parseSlug('-leading')).toBeNull();
    expect(parseSlug('has space')).toBeNull();
    expect(parseSlug('a'.repeat(200))).toBeNull();
    expect(parseSlug(null)).toBeNull();
  });
});
