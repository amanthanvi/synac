import { describe, expect, it } from 'vitest';

import {
  decodeHtmlEntities,
  extractAllByIdPrefix,
  extractFirstById,
  extractFirstInnerHtmlByClass,
  extractFirstInnerHtmlByTag,
  extractHrefPaths,
  stripHtmlTags,
} from './html.js';

describe('extractFirstById', () => {
  it('returns collapsed text when the id matches', () => {
    const html = '<div><h3 id="term-text">Access   Control</h3></div>';
    expect(extractFirstById(html, 'h3', 'term-text')).toBe('Access Control');
  });

  it('returns null when the id is absent', () => {
    const html = '<div><h3 id="other">Access Control</h3></div>';
    expect(extractFirstById(html, 'h3', 'term-text')).toBeNull();
  });

  it('returns null when the matched element has empty text', () => {
    expect(
      extractFirstById('<h3 id="term-text">   </h3>', 'h3', 'term-text'),
    ).toBeNull();
  });

  it('flattens nested tags into a single text run', () => {
    expect(
      extractFirstById('<span id="x">a <b>b</b> c</span>', 'span', 'x'),
    ).toBe('a b c');
  });

  it('collapses whitespace across newlines', () => {
    const html = '<h3 id="term-text">\n  Access\n\n  Control\t</h3>';
    expect(extractFirstById(html, 'h3', 'term-text')).toBe('Access Control');
  });

  it('decodes entities via text extraction', () => {
    const html = '<h3 id="t">A &amp; B &#39;quoted&#x27; &nbsp;end</h3>';
    expect(extractFirstById(html, 'h3', 't')).toBe("A & B 'quoted' end");
  });

  it('only matches the requested tag', () => {
    expect(extractFirstById('<p id="t">nope</p>', 'h3', 't')).toBeNull();
  });
});

describe('extractAllByIdPrefix', () => {
  it('returns every match in document order and skips empty ones', () => {
    const html = [
      '<div>',
      '<span id="term-def-text-1">first</span>',
      '<span id="term-def-text-2">   </span>',
      '<span id="term-def-text-3">third</span>',
      '<span id="unrelated">nope</span>',
      '</div>',
    ].join('');
    expect(extractAllByIdPrefix(html, 'span', 'term-def-text-')).toEqual([
      'first',
      'third',
    ]);
  });

  it('collapses whitespace and decodes entities in each match', () => {
    const html = '<a id="term-abbr-link-1">\n AC &amp;\n  DC </a>';
    expect(extractAllByIdPrefix(html, 'a', 'term-abbr-link-')).toEqual([
      'AC & DC',
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(
      extractAllByIdPrefix('<span id="x">y</span>', 'span', 'term-'),
    ).toEqual([]);
  });

  it('does not break on a prefix containing selector metacharacters', () => {
    const html = "<span id='a\"b-1'>ok</span>";
    expect(extractAllByIdPrefix(html, 'span', 'a"b-')).toEqual(['ok']);
  });
});

describe('extractFirstInnerHtmlByClass', () => {
  it('matches a class token among several and returns inner HTML', () => {
    const html =
      '<h1 class="foo page-title bar">Cross Site <em>Scripting</em></h1>';
    expect(extractFirstInnerHtmlByClass(html, 'h1', 'page-title')).toBe(
      'Cross Site <em>Scripting</em>',
    );
  });

  it('does not match a partial class token', () => {
    const html = '<h1 class="page-title-extra">nope</h1>';
    expect(extractFirstInnerHtmlByClass(html, 'h1', 'page-title')).toBeNull();
  });

  it('returns null when no element carries the class', () => {
    expect(
      extractFirstInnerHtmlByClass('<h1>plain</h1>', 'h1', 'page-title'),
    ).toBeNull();
  });

  it('returns the first match when several exist', () => {
    const html =
      '<h1 class="page-title">one</h1><h1 class="page-title">two</h1>';
    expect(extractFirstInnerHtmlByClass(html, 'h1', 'page-title')).toBe('one');
  });
});

describe('extractFirstInnerHtmlByTag', () => {
  it('returns inner HTML of the first matching tag', () => {
    const html = '<div><p>first <b>bold</b></p><p>second</p></div>';
    expect(extractFirstInnerHtmlByTag(html, 'p')).toBe('first <b>bold</b>');
  });

  it('returns null when the tag is absent', () => {
    expect(extractFirstInnerHtmlByTag('<div>x</div>', 'p')).toBeNull();
  });
});

describe('extractHrefPaths', () => {
  it('returns matching hrefs in document order, duplicates included', () => {
    const html = [
      '<a href="/glossary/term/a">a</a>',
      '<a href="/other/b">b</a>',
      '<a href="/glossary/term/c">c</a>',
      "<a href='/glossary/term/a'>a again</a>",
    ].join('');
    expect(extractHrefPaths(html, '/glossary/term/')).toEqual([
      '/glossary/term/a',
      '/glossary/term/c',
      '/glossary/term/a',
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(extractHrefPaths('<a href="/x">x</a>', '/glossary/term/')).toEqual(
      [],
    );
  });
});

describe('stripHtmlTags', () => {
  it('removes tags but leaves entities encoded for the later decode step', () => {
    expect(stripHtmlTags('<p>A &amp; B</p>')).toBe('A &amp; B');
  });

  it('composes with decodeHtmlEntities without double-decoding', () => {
    expect(
      decodeHtmlEntities(stripHtmlTags('<p>&amp;lt;script&amp;gt;</p>')),
    ).toBe('&lt;script&gt;');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeHtmlEntities('a &amp; b')).toBe('a & b');
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b');
    expect(decodeHtmlEntities('&#39;x&#39;')).toBe("'x'");
    expect(decodeHtmlEntities('&#x27;x&#x27;')).toBe("'x'");
    expect(decodeHtmlEntities('&quot;x&quot;')).toBe('"x"');
  });
});
