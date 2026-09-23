import { describe, expect, test } from 'vitest';

import { withoutQueryString } from './insights';

describe('withoutQueryString', () => {
  test('drops the search query from a reported URL', () => {
    const event = withoutQueryString({
      type: 'pageview',
      url: 'https://synac.app/search?q=my%20secret&scope=senses',
    });
    expect(event).toEqual({
      type: 'pageview',
      url: 'https://synac.app/search',
    });
  });

  test('keeps the fragment, so sense deep links still group', () => {
    expect(
      withoutQueryString({
        url: 'https://synac.app/term/domain?ref=x#s-network-domain',
      }).url,
    ).toBe('https://synac.app/term/domain#s-network-domain');
  });

  test('leaves a question mark inside the fragment alone', () => {
    const event = { url: 'https://synac.app/term/domain#what?' };
    expect(withoutQueryString(event)).toBe(event);
  });

  test('returns the same event when there is no query string', () => {
    const event = {
      type: 'vital',
      url: 'https://synac.app/terms',
      route: '/terms',
    };
    expect(withoutQueryString(event)).toBe(event);
  });
});
