/**
 * schema.org structured data for public pages.
 *
 * The payload is injected with `dangerouslySetInnerHTML`, so `serializeJsonLd`
 * is the only sanctioned way to turn a value into script content: it escapes
 * every character that could terminate the `<script>` element or open an HTML
 * comment.
 */

export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

/**
 * Escape `<`, `>`, and `&` as JSON unicode escapes. This neutralises
 * `</script>`, `<!--`, and `<![CDATA[` inside an inline JSON-LD block while
 * keeping the document byte-for-byte valid JSON.
 */
export function escapeJsonLd(json: string): string {
  return json
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

/** JSON text safe to place inside `<script type="application/ld+json">`. */
export function serializeJsonLd(value: JsonLdValue): string {
  return escapeJsonLd(JSON.stringify(value));
}

type JsonLdCitationInput = {
  url: string;
  name: string;
  publisher: string | null;
};

type JsonLdSenseInput = {
  name: string;
  description: string;
  url: string;
  citations: JsonLdCitationInput[];
};

type JsonLdEntryInput = {
  url: string;
  name: string;
  description: string | null;
  senses: JsonLdSenseInput[];
};

function creativeWork(citation: JsonLdCitationInput): JsonLdValue {
  const node: { [key: string]: JsonLdValue | undefined } = {
    '@type': 'CreativeWork',
    name: citation.name,
    url: citation.url,
  };

  if (citation.publisher) {
    node.publisher = { '@type': 'Organization', name: citation.publisher };
  }

  return node;
}

/** `DefinedTermSet` for an entry, with one `DefinedTerm` per published sense. */
export function buildEntryJsonLd(input: JsonLdEntryInput): JsonLdValue {
  const node: { [key: string]: JsonLdValue | undefined } = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': input.url,
    name: input.name,
    url: input.url,
  };

  if (input.description) node.description = input.description;

  if (input.senses.length) {
    node.hasDefinedTerm = input.senses.map((sense) => {
      const term: { [key: string]: JsonLdValue | undefined } = {
        '@type': 'DefinedTerm',
        name: sense.name,
        description: sense.description,
        url: sense.url,
        inDefinedTermSet: input.url,
      };

      if (sense.citations.length) {
        term.citation = sense.citations.map(creativeWork);
      }

      return term;
    });
  }

  return node;
}

type JsonLdTagInput = {
  url: string;
  name: string;
  description: string | null;
  terms: Array<{ name: string; url: string; description: string | null }>;
};

/** `DefinedTermSet` for a tag page. */
export function buildTagJsonLd(input: JsonLdTagInput): JsonLdValue {
  const node: { [key: string]: JsonLdValue | undefined } = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': input.url,
    name: input.name,
    url: input.url,
  };

  if (input.description) node.description = input.description;

  if (input.terms.length) {
    node.hasDefinedTerm = input.terms.map((term) => {
      const entry: { [key: string]: JsonLdValue | undefined } = {
        '@type': 'DefinedTerm',
        name: term.name,
        url: term.url,
        inDefinedTermSet: input.url,
      };
      if (term.description) entry.description = term.description;
      return entry;
    });
  }

  return node;
}
