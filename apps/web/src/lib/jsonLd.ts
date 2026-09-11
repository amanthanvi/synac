type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

type JsonLdDocument = { [key: string]: JsonLdValue | undefined };

type JsonLdCitation = {
  url: string;
  name: string;
  publisher: string;
  license: string | null;
};

type JsonLdSense = {
  name: string;
  description: string;
  url: string;
  citations: JsonLdCitation[];
};

type JsonLdTerm = {
  name: string;
  description: string | null;
  url: string;
};

/**
 * Serializes a JSON-LD document for a <script type="application/ld+json">
 * body. The angle brackets are escaped so a definition containing "</script>"
 * cannot close the tag early.
 */
export function renderJsonLd(document: JsonLdDocument): string {
  return JSON.stringify(document)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function creativeWork(citation: JsonLdCitation): JsonLdDocument {
  return {
    '@type': 'CreativeWork',
    url: citation.url,
    name: citation.name,
    publisher: { '@type': 'Organization', name: citation.publisher },
    license: citation.license ?? undefined,
  };
}

/** One DefinedTerm per sense so a search engine can surface a single meaning. */
export function buildEntryJsonLd(input: {
  url: string;
  name: string;
  description: string | null;
  senses: JsonLdSense[];
}): JsonLdDocument {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': input.url,
    name: input.name,
    url: input.url,
    description: input.description ?? undefined,
    hasDefinedTerm: input.senses.map((sense) => ({
      '@type': 'DefinedTerm',
      name: sense.name,
      description: sense.description,
      url: sense.url,
      inDefinedTermSet: input.url,
      citation: sense.citations.map(creativeWork),
    })),
  };
}

export function buildTagJsonLd(input: {
  url: string;
  name: string;
  description: string | null;
  terms: JsonLdTerm[];
}): JsonLdDocument {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': input.url,
    name: input.name,
    url: input.url,
    description: input.description ?? undefined,
    hasDefinedTerm: input.terms.map((term) => ({
      '@type': 'DefinedTerm',
      name: term.name,
      description: term.description ?? undefined,
      url: term.url,
      inDefinedTermSet: input.url,
    })),
  };
}
