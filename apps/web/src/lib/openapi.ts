/**
 * Hand-written OpenAPI 3.1 description of the public read API. It is written
 * by hand rather than generated so that it is a contract: a route that changes
 * shape without a matching edit here is a documented lie, and the path list in
 * openapi.test.ts fails when a route is added without being described.
 *
 * Only the public read surface is described. /api/v1/csp-report is a browser
 * reporting sink and /api/v1/internal/revalidate is an operator endpoint that
 * deliberately answers 404 when it is unconfigured, so neither is advertised.
 */

const DEFAULT_SITE_URL = 'https://synac.app';

type OpenApiSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: string[];
  $ref?: string;
  oneOf?: OpenApiSchema[];
  const?: string;
  additionalProperties?: boolean;
};

type OpenApiParameter = {
  name: string;
  in: 'query' | 'path';
  required?: boolean;
  description: string;
  schema: OpenApiSchema;
};

type OpenApiResponse = {
  description: string;
  content?: Record<string, { schema: OpenApiSchema }>;
  headers?: Record<string, { description: string; schema: OpenApiSchema }>;
};

type OpenApiOperation = {
  operationId: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  responses: Record<string, OpenApiResponse>;
};

type OpenApiPathItem = {
  get?: OpenApiOperation;
  options?: OpenApiOperation;
};

type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    license: { name: string; url: string };
  };
  servers: Array<{ url: string }>;
  paths: Record<string, OpenApiPathItem>;
  components: { schemas: Record<string, OpenApiSchema> };
};

function ref(name: string): OpenApiSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function str(description?: string): OpenApiSchema {
  return { type: 'string', description };
}

function nullableStr(description?: string): OpenApiSchema {
  return { type: ['string', 'null'], description };
}

function num(description?: string): OpenApiSchema {
  return { type: 'number', description };
}

function bool(description?: string): OpenApiSchema {
  return { type: 'boolean', description };
}

function arrayOf(items: OpenApiSchema, description?: string): OpenApiSchema {
  return { type: 'array', items, description };
}

function object(
  properties: Record<string, OpenApiSchema>,
  description?: string,
): OpenApiSchema {
  return {
    type: 'object',
    description,
    properties,
    required: Object.keys(properties),
  };
}

function jsonResponse(
  description: string,
  schema: OpenApiSchema,
): OpenApiResponse {
  return {
    description,
    content: { 'application/json': { schema } },
    headers: {
      ETag: {
        description:
          'Quoted sha1 of the serialized body. Send it back as If-None-Match to get a 304.',
        schema: str(),
      },
      'Cache-Control': {
        description:
          'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
        schema: str(),
      },
      'Access-Control-Allow-Origin': {
        description: 'Always *. Every read route is open to cross-origin GETs.',
        schema: str(),
      },
    },
  };
}

const NOT_MODIFIED: OpenApiResponse = {
  description:
    'The If-None-Match request header matched the current ETag. No body is returned; the caching headers are the same as on the 200.',
};

const BAD_REQUEST: OpenApiResponse = {
  description: 'A required query parameter is missing or malformed.',
  content: { 'application/json': { schema: ref('Error') } },
};

const NOT_FOUND: OpenApiResponse = {
  description: 'No such entry, sense, or source in the published corpus.',
  content: { 'application/json': { schema: ref('Error') } },
};

const RATE_LIMITED: OpenApiResponse = {
  description:
    'The caller exceeded the shared rate limit for /api/v1. Retry-After carries the same value as retryAfterSeconds.',
  content: { 'application/json': { schema: ref('RateLimited') } },
  headers: {
    'Retry-After': {
      description: 'Seconds to wait before retrying.',
      schema: num(),
    },
  },
};

const SERVER_ERROR: OpenApiResponse = {
  description:
    'An upstream read failed. The body carries an opaque error code and the request id; no internal detail is exposed.',
  content: { 'application/json': { schema: ref('Error') } },
};

const pageParam: OpenApiParameter = {
  name: 'page',
  in: 'query',
  description: '1-based page number. Values outside the range are clamped.',
  schema: { type: 'integer', format: 'int32' },
};

const pageSizeParam: OpenApiParameter = {
  name: 'pageSize',
  in: 'query',
  description: 'Results per page, 1 to 100. Defaults to 50.',
  schema: { type: 'integer', format: 'int32' },
};

const letterParam: OpenApiParameter = {
  name: 'letter',
  in: 'query',
  description:
    'First-letter bucket: a single letter a-z, or 0-9. Anything else falls back to a.',
  schema: { type: 'string' },
};

function typeParam(required: boolean): OpenApiParameter {
  return {
    name: 'type',
    in: 'query',
    required,
    description: 'Entry type. Case insensitive.',
    schema: { type: 'string', enum: ['TERM', 'ACRONYM'] },
  };
}

const slugParam: OpenApiParameter = {
  name: 'slug',
  in: 'query',
  required: true,
  description:
    'Entry slug, lowercase alphanumerics and hyphens. A redirect slug is accepted and resolves to its canonical entry.',
  schema: { type: 'string' },
};

function browseOperation(
  operationId: string,
  summary: string,
  entryType: string,
): OpenApiOperation {
  return {
    operationId,
    summary,
    description: `Alphabetical listing of ${entryType} entries, sorted by title.`,
    tags: ['browse'],
    parameters: [letterParam, pageParam, pageSizeParam],
    responses: {
      '200': jsonResponse('A page of entry summaries.', ref('BrowsePage')),
      '304': NOT_MODIFIED,
      '429': RATE_LIMITED,
      '500': SERVER_ERROR,
    },
  };
}

const schemas: Record<string, OpenApiSchema> = {
  Error: object({
    error: str('Stable machine-readable code, for example not_found.'),
    requestId: str('Value of the x-request-id request header.'),
  }),
  RateLimited: object({
    error: { type: 'string', const: 'rate_limited' },
    requestId: str(),
    retryAfterSeconds: num(),
  }),
  EntryTag: object({
    slug: str(),
    name: str(),
    assignedBy: { type: 'string', enum: ['EDITORIAL', 'AUTO'] },
  }),
  Citation: object({
    sourceSlug: str(),
    sourceName: str(),
    url: str('Link to the cited source document.'),
    documentTitle: nullableStr(),
    citationText: nullableStr('Human-readable pointer into the document.'),
    locator: nullableStr('Line, anchor, or fragment within the document.'),
    contentMode: {
      type: 'string',
      enum: ['QUOTED', 'SUMMARIZED', 'PARAPHRASED'],
    },
    documentSha256: str('Hash of the fetched document at accessedAt.'),
    attributionText: str(),
    accessedAt: { type: 'string', format: 'date-time' },
    licenseNote: nullableStr(),
    licenseUrl: nullableStr('License governing this citation text.'),
    publicStatement: nullableStr(),
  }),
  Attestation: object({
    key: str(),
    sourceSlug: str(),
    sourceName: str(),
    definitionText: str(),
    citation: ref('Citation'),
  }),
  Example: object({ md: str(), text: str() }),
  Sense: object({
    key: str(),
    anchor: str('Fragment id of the sense heading on the entry page.'),
    order: num(),
    label: nullableStr(),
    labelFallback: str(),
    expandedForm: nullableStr('Acronym expansion, when the entry is one.'),
    disambiguationNote: nullableStr(),
    definitionText: str(),
    definitionMd: str(),
    isEditorial: bool(),
    editorialRationale: nullableStr(),
    isPreferred: bool(),
    examples: arrayOf(ref('Example')),
    attestations: arrayOf(
      ref('Attestation'),
      'Other sources that attest this sense. Their citations also appear in citations.',
    ),
    citations: arrayOf(ref('Citation'), 'citations[0] is the primary source.'),
  }),
  Entry: object({
    entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
    slug: str(),
    canonicalUrl: str('Absolute URL of the entry page.'),
    title: str(),
    aliases: arrayOf(str()),
    summary: nullableStr(),
    summaryMd: nullableStr(),
    editorialNotes: nullableStr(),
    updatedAt: { type: 'string', format: 'date-time' },
    tags: arrayOf(ref('EntryTag')),
    senses: arrayOf(ref('Sense')),
  }),
  Relationship: object({
    type: { type: 'string', enum: ['RELATED', 'SEE_ALSO', 'CONTRAST'] },
    entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
    slug: str(),
    title: str(),
    summary: nullableStr(),
    url: str('Site-relative path of the related entry.'),
  }),
  EntryDocument: {
    type: 'object',
    properties: {
      canonicalUrl: str('Absolute URL of the canonical entry page.'),
      canonicalSlug: str(
        'Present only when the requested slug was a redirect. Follow it.',
      ),
      entry: ref('Entry'),
      relationships: arrayOf(ref('Relationship')),
    },
    required: ['canonicalUrl', 'entry', 'relationships'],
  },
  EntrySummary: object({
    entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
    slug: str(),
    title: str(),
    summary: nullableStr(),
    senseSummary: nullableStr(),
    tags: arrayOf(ref('EntryTag')),
    updatedAt: { type: 'string', format: 'date-time' },
    url: str('Site-relative path of the entry page.'),
  }),
  BrowsePage: object({
    results: arrayOf(ref('EntrySummary')),
    meta: object({
      letter: str(),
      page: num(),
      pageSize: num(),
      total: num('Matches in this letter bucket.'),
      hasMore: bool(),
    }),
  }),
  Tag: object({
    slug: str(),
    name: str(),
    description: str(),
    entryCount: num(),
    editorialCount: num(),
    autoCount: num(),
    url: str('Site-relative path of the tag page.'),
  }),
  TagDirectory: object({
    results: arrayOf(ref('Tag')),
    meta: object({ total: num() }),
  }),
  Source: object({
    slug: str(),
    name: str(),
    baseUrl: str('Where the source is fetched from.'),
    licenseType: str(),
    licenseUrl: nullableStr(),
    licenseNotes: nullableStr(),
    publicStatement: nullableStr(),
    contentMode: {
      type: 'string',
      enum: ['QUOTED', 'SUMMARIZED', 'PARAPHRASED'],
    },
    allowedUse: str(),
    attributionRequirements: str(),
    trustTier: str(),
    enabled: bool(),
    lastVerifiedAt: { type: 'string', format: 'date-time' },
    citedEntryCount: num(),
    url: str('Site-relative path of the source page.'),
  }),
  SourceList: object({
    results: arrayOf(ref('Source')),
    meta: object({ total: num() }),
  }),
  SourceDocument: object({ source: ref('Source') }),
  EntrySearchResult: object({
    id: str('Stable entry key, for example TERM:phishing.'),
    entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
    displayTitle: str(),
    primarySlug: str(),
    summaryText: nullableStr(),
    snippet: nullableStr('Match context. << >> marks the matched run.'),
    senseCount: num(),
    senseSummary: nullableStr(),
    url: str('Site-relative path of the entry page.'),
  }),
  SenseSearchResult: object({
    entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
    slug: str(),
    title: str(),
    senseKey: str(),
    anchor: str(),
    label: nullableStr(),
    expandedForm: nullableStr(),
    labelFallback: str(),
    sourceNames: arrayOf(str()),
    snippet: nullableStr('Match context. << >> marks the matched run.'),
    url: str('Site-relative path with the sense anchor.'),
  }),
  SearchPage: object({
    results: arrayOf({
      oneOf: [ref('EntrySearchResult'), ref('SenseSearchResult')],
      description:
        'EntrySearchResult when scope is entries, SenseSearchResult when scope is senses.',
    }),
    meta: object({
      page: num(),
      pageSize: num(),
      total: num(),
      hasMore: bool(),
      scope: { type: 'string', enum: ['entries', 'senses'] },
    }),
  }),
  SenseCitationDocument: object({
    entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
    slug: str(),
    entryTitle: str(),
    senseKey: str(),
    senseHeading: str('label, else expandedForm, else labelFallback.'),
    anchor: str(),
    canonicalUrl: str('Absolute URL of the entry page plus the sense anchor.'),
    primaryCitation: {
      ...ref('Citation'),
      description: 'citations[0] of the sense, or null when it has none.',
    },
    attestations: arrayOf(ref('Attestation')),
  }),
  ExportLicense: object({
    editorial: object({ name: str(), url: str(), covers: str() }),
    sourceText: object({ covers: str(), note: str() }),
  }),
  ExportPage: object({
    license: ref('ExportLicense'),
    results: arrayOf(ref('Entry')),
    meta: object({
      page: num(),
      pageSize: num('Always 50.'),
      total: num('Entries in the whole corpus.'),
      hasMore: bool(),
    }),
  }),
  Health: object({
    ok: bool('False when the content backend could not be reached.'),
    version: str('Version of the web app.'),
  }),
};

const paths: Record<string, OpenApiPathItem> = {
  '/api/healthz': {
    get: {
      operationId: 'getHealth',
      summary: 'Liveness and backend reachability',
      description:
        'Reads one entry from the content backend. Responds 503 with ok:false when that read fails. Never cached.',
      tags: ['ops'],
      responses: {
        '200': {
          description: 'The backend answered.',
          content: { 'application/json': { schema: ref('Health') } },
        },
        '503': {
          description: 'The backend read failed.',
          content: { 'application/json': { schema: ref('Health') } },
        },
      },
    },
  },
  '/api/v1/entries/by-slug': {
    get: {
      operationId: 'getEntryBySlug',
      summary: 'One entry with its senses, citations, and relationships',
      tags: ['entries'],
      parameters: [typeParam(true), slugParam],
      responses: {
        '200': jsonResponse('The resolved entry.', ref('EntryDocument')),
        '304': NOT_MODIFIED,
        '400': BAD_REQUEST,
        '404': NOT_FOUND,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/terms': {
    get: browseOperation('listTerms', 'Browse terms by letter', 'TERM'),
  },
  '/api/v1/acronyms': {
    get: browseOperation(
      'listAcronyms',
      'Browse acronyms by letter',
      'ACRONYM',
    ),
  },
  '/api/v1/tags': {
    get: {
      operationId: 'listTags',
      summary: 'The full tag directory',
      tags: ['tags'],
      responses: {
        '200': jsonResponse('Every published tag.', ref('TagDirectory')),
        '304': NOT_MODIFIED,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/sources': {
    get: {
      operationId: 'listSources',
      summary: 'Every source the corpus cites',
      tags: ['sources'],
      responses: {
        '200': jsonResponse('Every published source.', ref('SourceList')),
        '304': NOT_MODIFIED,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/sources/{slug}': {
    get: {
      operationId: 'getSource',
      summary: 'One source with its license and attribution terms',
      tags: ['sources'],
      parameters: [
        {
          name: 'slug',
          in: 'path',
          required: true,
          description: 'Source slug.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': jsonResponse('The source.', ref('SourceDocument')),
        '304': NOT_MODIFIED,
        '400': BAD_REQUEST,
        '404': NOT_FOUND,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/search': {
    get: {
      operationId: 'search',
      summary: 'Full-text search over entries or senses',
      description:
        'A query that the index ignores (empty, one character, or a bare stopword) returns 200 with an empty results array and total 0, not an error. Queries longer than 120 characters are truncated.',
      tags: ['search'],
      parameters: [
        {
          name: 'q',
          in: 'query',
          description: 'Search query, truncated to 120 characters.',
          schema: { type: 'string' },
        },
        typeParam(false),
        {
          name: 'tag',
          in: 'query',
          description: 'Tag slug filter. Applies to scope=entries only.',
          schema: { type: 'string' },
        },
        {
          name: 'page',
          in: 'query',
          description: '1-based page number, clamped to 1..10.',
          schema: { type: 'integer', format: 'int32' },
        },
        {
          name: 'scope',
          in: 'query',
          description: 'What to search. Defaults to entries.',
          schema: { type: 'string', enum: ['entries', 'senses'] },
        },
      ],
      responses: {
        '200': jsonResponse(
          'A page of results, 20 per page.',
          ref('SearchPage'),
        ),
        '304': NOT_MODIFIED,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/senses/citation.json': {
    get: {
      operationId: 'getSenseCitation',
      summary: 'Provenance for a single sense',
      description:
        'The primary citation of the sense plus the citation behind each attestation, with the document hash, locator, access time, and license of each.',
      tags: ['entries'],
      parameters: [
        typeParam(true),
        slugParam,
        {
          name: 'sense',
          in: 'query',
          required: true,
          description: 'Sense key, as returned in Sense.key.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': jsonResponse(
          'Provenance for the sense.',
          ref('SenseCitationDocument'),
        ),
        '304': NOT_MODIFIED,
        '400': BAD_REQUEST,
        '404': NOT_FOUND,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/export/entries.json': {
    get: {
      operationId: 'exportEntries',
      summary: 'The whole corpus, 50 entries per page',
      description:
        'Terms first, then acronyms, each hydrated with every sense and citation. Walk pages until meta.hasMore is false.',
      tags: ['export'],
      parameters: [
        {
          name: 'page',
          in: 'query',
          description: '1-based page number, clamped to the last page.',
          schema: { type: 'integer', format: 'int32' },
        },
      ],
      responses: {
        '200': jsonResponse(
          'A page of full entry records with the license block.',
          ref('ExportPage'),
        ),
        '304': NOT_MODIFIED,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
  '/api/v1/openapi.json': {
    get: {
      operationId: 'getOpenApiDocument',
      summary: 'This document',
      tags: ['meta'],
      responses: {
        '200': jsonResponse('The OpenAPI 3.1 document.', { type: 'object' }),
        '304': NOT_MODIFIED,
        '429': RATE_LIMITED,
        '500': SERVER_ERROR,
      },
    },
  },
};

export function buildOpenApiDocument(): OpenApiDocument {
  const serverUrl = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL
  ).replace(/\/+$/, '');

  return {
    openapi: '3.1.0',
    info: {
      title: 'SynAc public read API',
      version: '1.0.0',
      description: [
        'Read-only JSON over the SynAc corpus of security terms and acronyms.',
        'Every route is a GET, answers OPTIONS, and sends Access-Control-Allow-Origin: * so it can be called from any origin. Preflight allows GET and OPTIONS with the content-type and if-none-match headers.',
        'Responses carry an ETag; send it back as If-None-Match to get a 304. All /api/v1 routes share one rate-limit budget keyed by caller address.',
        'The editorial layer is CC BY 4.0. Quoted source text stays under the license of its source, identified by licenseUrl and publicStatement on each citation.',
      ].join('\n\n'),
      license: {
        name: 'CC BY 4.0 (editorial layer)',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    },
    servers: [{ url: serverUrl }],
    paths,
    components: { schemas },
  };
}
