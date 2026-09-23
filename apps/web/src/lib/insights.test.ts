import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  beforeInsightsSend,
  prepareInsightsEvent,
  withoutQueryString,
} from './insights';

describe('withoutQueryString', () => {
  test('drops the search query from a reported URL', () => {
    const event = withoutQueryString({
      type: 'vital',
      url: 'https://synac.app/search?q=my%20secret&scope=senses',
    });
    expect(event).toEqual({
      type: 'vital',
      url: 'https://synac.app/search',
    });
  });

  test('drops an empty query string', () => {
    expect(withoutQueryString({ url: 'https://synac.app/search?' }).url).toBe(
      'https://synac.app/search',
    );
  });

  test('keeps the fragment', () => {
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

describe('prepareInsightsEvent', () => {
  const event = { type: 'vital', url: 'https://synac.app/search?q=secret' };

  test('drops every report when the browser sends Global Privacy Control', () => {
    expect(prepareInsightsEvent(event, true)).toBeNull();
  });

  test('strips the query string otherwise', () => {
    expect(prepareInsightsEvent(event, false)).toEqual({
      type: 'vital',
      url: 'https://synac.app/search',
    });
  });
});

describe('beforeInsightsSend', () => {
  const event = { type: 'vital', url: 'https://synac.app/search?q=secret' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('strips the query string when there is no signal', () => {
    vi.stubGlobal('navigator', {});
    expect(beforeInsightsSend(event)?.url).toBe('https://synac.app/search');
  });

  test('drops the report when navigator.globalPrivacyControl is true', () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    expect(beforeInsightsSend(event)).toBeNull();
  });
});
