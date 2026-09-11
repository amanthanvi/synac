import { describe, expect, test } from 'vitest';

import { buildEntryJsonLd, buildTagJsonLd, renderJsonLd } from './jsonLd';

describe('renderJsonLd', () => {
  test('cannot close the surrounding script tag', () => {
    const rendered = renderJsonLd(
      buildEntryJsonLd({
        url: 'https://synac.app/term/xss',
        name: 'xss',
        description: '</script><img src=x onerror=alert(1)>',
        senses: [],
      }),
    );
    expect(rendered).not.toContain('</script>');
    expect(rendered).not.toContain('<');
    expect(rendered).not.toContain('>');
    expect(rendered).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(rendered).description).toBe(
      '</script><img src=x onerror=alert(1)>',
    );
  });

  test('escapes ampersands so entity tricks cannot re-form a tag', () => {
    const rendered = renderJsonLd({ name: 'a & b' });
    expect(rendered).toContain('\\u0026');
    expect(JSON.parse(rendered).name).toBe('a & b');
  });
});

describe('buildEntryJsonLd', () => {
  test('emits one DefinedTerm per sense with its citations', () => {
    const document = buildEntryJsonLd({
      url: 'https://synac.app/acronym/black',
      name: 'BLACK',
      description: null,
      senses: [
        {
          name: '1 (N)',
          description: 'Encrypted information.',
          url: 'https://synac.app/acronym/black#sense-rfc4949-1-n',
          citations: [
            {
              url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
              name: 'RFC 4949',
              publisher: 'IETF',
              license: 'https://www.rfc-editor.org/copyright/',
            },
          ],
        },
      ],
    });
    expect(document['@type']).toBe('DefinedTermSet');
    expect(document.description).toBeUndefined();
    const terms = JSON.parse(renderJsonLd(document)).hasDefinedTerm;
    expect(terms).toHaveLength(1);
    expect(terms[0].inDefinedTermSet).toBe('https://synac.app/acronym/black');
    expect(terms[0].citation[0]).toEqual({
      '@type': 'CreativeWork',
      url: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
      name: 'RFC 4949',
      publisher: { '@type': 'Organization', name: 'IETF' },
      license: 'https://www.rfc-editor.org/copyright/',
    });
  });
});

describe('buildTagJsonLd', () => {
  test('lists tagged entries as defined terms', () => {
    const document = buildTagJsonLd({
      url: 'https://synac.app/tags/cryptography',
      name: 'Cryptography',
      description: 'Keys and ciphers.',
      terms: [
        {
          name: 'AES',
          description: null,
          url: 'https://synac.app/acronym/aes',
        },
      ],
    });
    const parsed = JSON.parse(renderJsonLd(document));
    expect(parsed.hasDefinedTerm[0]).toEqual({
      '@type': 'DefinedTerm',
      name: 'AES',
      url: 'https://synac.app/acronym/aes',
      inDefinedTermSet: 'https://synac.app/tags/cryptography',
    });
  });
});
