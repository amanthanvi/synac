/**
 * Hand-written OpenAPI 3.1 description of the public read API.
 *
 * Hand-written on purpose: generated specs drift into describing the
 * implementation (every nullable column, every internal id) rather than the
 * contract. Keep this in step with `src/app/api/v1/**`: if you add, rename, or
 * remove a public route or response field, edit it here in the same change.
 */
import type { JsonPayload } from './apiErrors';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const PAGE_PARAM = {
  name: 'page',
  in: 'query',
  required: false,
  schema: { type: 'integer', minimum: 1, default: 1 },
  description: '1-based page number.',
} as const;

const PAGE_SIZE_PARAM = {
  name: 'pageSize',
  in: 'query',
  required: false,
  schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
} as const;

const TYPE_PARAM = {
  name: 'type',
  in: 'query',
  required: false,
  schema: { type: 'string', enum: ['TERM', 'ACRONYM'] },
} as const;

const NOT_FOUND_RESPONSE = {
  description: 'No published resource matches.',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/Error' } },
  },
} as const;

const RATE_LIMITED_RESPONSE = {
  description: 'Rate limit exceeded. Retry after `Retry-After` seconds.',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/Error' } },
  },
} as const;

const NOT_MODIFIED_RESPONSE = {
  description: "The caller's `If-None-Match` matches the current `ETag`.",
} as const;

function listResponse(itemsRef: string, description: string) {
  return {
    '200': {
      description,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['items', 'meta'],
            properties: {
              items: { type: 'array', items: { $ref: itemsRef } },
              meta: { $ref: '#/components/schemas/PageMeta' },
              license: { $ref: '#/components/schemas/License' },
            },
          },
        },
      },
    },
    '304': NOT_MODIFIED_RESPONSE,
    '429': RATE_LIMITED_RESPONSE,
  };
}

export function buildOpenApiDocument(): JsonPayload {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SynAc Public API',
      version: '1.0.0',
      summary: 'Read-only access to the SynAc cybersecurity glossary.',
      description: [
        'Every definition is returned with the citations that attest it, so a consumer',
        'inherits the attribution obligation rather than having to reconstruct it.',
        '',
        'The editorial layer (summaries, sense labels, disambiguation notes, curation and',
        'relationships) is licensed CC BY 4.0. Each source-attested definition is governed',
        'by the licence of its own source, reported inline under',
        '`senses[].citations[].source`.',
        '',
        'All GET responses are cacheable (`public, max-age=60, s-maxage=300,',
        'stale-while-revalidate=3600`), carry a strong `ETag` that honours `If-None-Match`,',
        'and allow cross-origin reads from any origin.',
      ].join('\n'),
      license: {
        name: 'CC BY 4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    },
    servers: [{ url: SITE_URL }],
    tags: [
      {
        name: 'entries',
        description: 'Glossary entries (terms and acronyms).',
      },
      { name: 'tags', description: 'Editorial and automatic topic tags.' },
      {
        name: 'sources',
        description: 'Upstream sources and their licence terms.',
      },
      {
        name: 'senses',
        description: 'Individual meanings and their provenance.',
      },
      {
        name: 'search',
        description: 'Full-text search over entries or meanings.',
      },
      {
        name: 'export',
        description: 'Bulk download of the published dataset.',
      },
    ],
    paths: {
      '/api/healthz': {
        get: {
          summary: 'Liveness and database readiness.',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'The process is serving and Postgres answered.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['ok', 'version'],
                    properties: {
                      ok: { type: 'boolean' },
                      version: { type: 'string' },
                    },
                  },
                },
              },
            },
            '503': { description: 'The database is unreachable.' },
          },
        },
      },
      '/api/v1/entries/by-slug': {
        get: {
          tags: ['entries'],
          summary: 'Fetch one published entry by type and slug.',
          description:
            'Historic slugs resolve to the entry that now owns them.',
          operationId: 'getEntryBySlug',
          parameters: [
            {
              name: 'type',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['TERM', 'ACRONYM'] },
            },
            {
              name: 'slug',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'The entry with all published senses and their citations.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['entry'],
                    properties: {
                      entry: { $ref: '#/components/schemas/Entry' },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '400': { description: 'Missing or invalid `type`/`slug`.' },
            '404': NOT_FOUND_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/entries/{id}': {
        get: {
          tags: ['entries'],
          summary: 'Fetch one published entry by id.',
          operationId: 'getEntryById',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description:
                'The entry with all published senses and their citations.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['entry'],
                    properties: {
                      entry: { $ref: '#/components/schemas/Entry' },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '404': NOT_FOUND_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/terms': {
        get: {
          tags: ['entries'],
          summary: 'List published terms.',
          operationId: 'listTerms',
          parameters: [
            {
              name: 'letter',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description:
                "A single a-z letter, or '0' / '0-9' for titles starting with a digit.",
            },
            {
              name: 'tag',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description:
                'Substring filter. For ranked matching use /api/v1/search.',
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['title', 'updated'],
                default: 'title',
              },
            },
            PAGE_PARAM,
            PAGE_SIZE_PARAM,
          ],
          responses: listResponse(
            '#/components/schemas/EntryListItem',
            'A page of terms.',
          ),
        },
      },
      '/api/v1/acronyms': {
        get: {
          tags: ['entries'],
          summary: 'List published acronyms.',
          operationId: 'listAcronyms',
          parameters: [
            {
              name: 'letter',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'tag',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['title', 'updated'],
                default: 'title',
              },
            },
            PAGE_PARAM,
            PAGE_SIZE_PARAM,
          ],
          responses: listResponse(
            '#/components/schemas/EntryListItem',
            'A page of acronyms.',
          ),
        },
      },
      '/api/v1/tags': {
        get: {
          tags: ['tags'],
          summary: 'List every tag with its published-entry count.',
          operationId: 'listTags',
          responses: {
            '200': {
              description: 'All tags.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['items'],
                    properties: {
                      items: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Tag' },
                      },
                      meta: {
                        type: 'object',
                        properties: { total: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/tags/{slug}/entries': {
        get: {
          tags: ['tags'],
          summary: 'List published entries carrying a tag.',
          operationId: 'listTagEntries',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            TYPE_PARAM,
            PAGE_PARAM,
            PAGE_SIZE_PARAM,
          ],
          responses: {
            ...listResponse(
              '#/components/schemas/EntryListItem',
              'A page of tagged entries.',
            ),
            '404': NOT_FOUND_RESPONSE,
          },
        },
      },
      '/api/v1/sources': {
        get: {
          tags: ['sources'],
          summary:
            'List enabled sources with licence terms and citation statistics.',
          operationId: 'listSources',
          responses: {
            '200': {
              description: 'All enabled sources.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['items'],
                    properties: {
                      items: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Source' },
                      },
                      meta: {
                        type: 'object',
                        properties: { total: { type: 'integer' } },
                      },
                      license: { $ref: '#/components/schemas/License' },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/sources/{slug}': {
        get: {
          tags: ['sources'],
          summary: 'One source and the entries it attests.',
          operationId: 'getSource',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            PAGE_PARAM,
            PAGE_SIZE_PARAM,
          ],
          responses: {
            '200': {
              description: 'The source plus a page of entries citing it.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['source', 'items', 'meta'],
                    properties: {
                      source: { $ref: '#/components/schemas/Source' },
                      items: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/EntryListItem' },
                      },
                      meta: { $ref: '#/components/schemas/PageMeta' },
                      license: { $ref: '#/components/schemas/License' },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '404': NOT_FOUND_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/senses/{id}/citation.json': {
        get: {
          tags: ['senses'],
          summary: 'The provenance record for one published meaning.',
          description:
            'Every source that attests this meaning, with the document, content hash, and locator the wording came from.',
          operationId: 'getSenseCitationRecord',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'The citation record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SenseCitationRecord' },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '404': NOT_FOUND_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/search': {
        get: {
          tags: ['search'],
          summary: 'Search published entries, or published meanings.',
          description:
            'Ranking internals are not exposed. `scope=senses` returns per-meaning hits whose `url` carries the `#s-<slug>` fragment for the matching sense.',
          operationId: 'search',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'scope',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['entries', 'senses'],
                default: 'entries',
              },
            },
            TYPE_PARAM,
            {
              name: 'tag',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Entry scope only.',
            },
            PAGE_PARAM,
          ],
          responses: {
            '200': {
              description: 'A page of results.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['results', 'meta', 'scope', 'total'],
                    properties: {
                      scope: { type: 'string', enum: ['entries', 'senses'] },
                      total: {
                        type: 'integer',
                        description: 'Total matches; mirrors `meta.total`.',
                      },
                      results: {
                        type: 'array',
                        items: {
                          oneOf: [
                            { $ref: '#/components/schemas/EntrySearchResult' },
                            { $ref: '#/components/schemas/SenseSearchResult' },
                          ],
                        },
                      },
                      meta: { $ref: '#/components/schemas/PageMeta' },
                      license: { $ref: '#/components/schemas/License' },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '400': { description: 'Invalid `scope`.' },
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/export/entries.json': {
        get: {
          tags: ['export'],
          summary: 'Bulk export of the published dataset as JSON.',
          description: 'Follow `meta.nextPage` until it is null.',
          operationId: 'exportEntriesJson',
          parameters: [
            PAGE_PARAM,
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 500,
                default: 200,
              },
            },
            TYPE_PARAM,
          ],
          responses: {
            '200': {
              description: 'A page of full entry records.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['items', 'meta'],
                    properties: {
                      items: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Entry' },
                      },
                      meta: {
                        allOf: [
                          { $ref: '#/components/schemas/PageMeta' },
                          {
                            type: 'object',
                            properties: {
                              nextPage: { type: ['integer', 'null'] },
                            },
                          },
                        ],
                      },
                      license: { $ref: '#/components/schemas/License' },
                    },
                  },
                },
              },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/export/entries.csv': {
        get: {
          tags: ['export'],
          summary: 'Bulk export as CSV, one row per (sense, citation) pair.',
          description:
            'Pagination is reported in the `X-Synac-Page`, `X-Synac-Page-Count`, and `X-Synac-Total` response headers.',
          operationId: 'exportEntriesCsv',
          parameters: [
            PAGE_PARAM,
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 500,
                default: 200,
              },
            },
            TYPE_PARAM,
          ],
          responses: {
            '200': {
              description: 'CSV rows.',
              content: { 'text/csv': { schema: { type: 'string' } } },
            },
            '304': NOT_MODIFIED_RESPONSE,
            '429': RATE_LIMITED_RESPONSE,
          },
        },
      },
      '/api/v1/openapi.json': {
        get: {
          summary: 'This document.',
          operationId: 'getOpenApiDocument',
          responses: {
            '200': { description: 'The OpenAPI 3.1 description of this API.' },
          },
        },
      },
      '/api/v1/csp-report': {
        post: {
          summary: 'Content-Security-Policy violation sink.',
          description:
            'Used by the browser via `report-to`/`report-uri`. Always answers 204.',
          operationId: 'reportCspViolation',
          responses: {
            '204': { description: 'Accepted.' },
            '429': { description: 'Rate limited.' },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
        PageMeta: {
          type: 'object',
          required: ['page', 'pageSize', 'total', 'pageCount'],
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            pageCount: { type: 'integer' },
          },
        },
        License: {
          type: 'object',
          description:
            'Two-layer licence notice: the editorial layer is CC BY 4.0; each attestation carries its own source licence.',
          properties: {
            editorial: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                statement: { type: 'string' },
              },
            },
            attestations: {
              type: 'object',
              properties: { statement: { type: 'string' } },
            },
          },
        },
        Source: {
          type: 'object',
          required: ['id', 'name', 'slug', 'licenseType'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            trustTier: {
              type: 'string',
              enum: ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4'],
            },
            tierRationale: { type: ['string', 'null'] },
            licenseType: { type: 'string' },
            licenseUrl: { type: ['string', 'null'], format: 'uri' },
            licenseStatement: { type: ['string', 'null'] },
            licenseNotes: { type: ['string', 'null'] },
            attributionHtml: { type: ['string', 'null'] },
            attributionRequirements: { type: 'string' },
            allowedUse: { type: 'string' },
            snapshotAllowed: { type: 'boolean' },
            defaultContentMode: {
              type: 'string',
              enum: ['QUOTED', 'SUMMARIZED', 'PARAPHRASED'],
            },
            lastVerifiedAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' },
            citedEntryCount: { type: 'integer' },
            citationCount: { type: 'integer' },
            latestAccessedAt: { type: ['string', 'null'], format: 'date-time' },
            pageUrl: { type: 'string' },
          },
        },
        SourceRef: {
          type: 'object',
          required: ['id', 'name', 'slug'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            trustTier: { type: 'string' },
            licenseType: { type: 'string' },
            licenseUrl: { type: ['string', 'null'], format: 'uri' },
            licenseStatement: { type: ['string', 'null'] },
            attributionHtml: { type: ['string', 'null'] },
            attributionRequirements: { type: 'string' },
          },
        },
        Citation: {
          type: 'object',
          required: ['id', 'url', 'source'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            url: { type: 'string', format: 'uri' },
            citationText: { type: ['string', 'null'] },
            licenseNote: { type: ['string', 'null'] },
            attributionText: { type: ['string', 'null'] },
            accessedAt: { type: ['string', 'null'], format: 'date-time' },
            document: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                title: { type: ['string', 'null'] },
                url: { type: 'string', format: 'uri' },
                canonicalUrl: { type: ['string', 'null'], format: 'uri' },
                contentSha256: { type: 'string' },
                fetchedAt: { type: ['string', 'null'], format: 'date-time' },
              },
            },
            source: { $ref: '#/components/schemas/SourceRef' },
          },
        },
        Attestation: {
          description:
            "One source's attested wording of a meaning: the citation, with the attested definition and extraction metadata inlined.",
          allOf: [
            { $ref: '#/components/schemas/Citation' },
            {
              type: 'object',
              required: ['attestationId', 'contentMode', 'definition'],
              properties: {
                attestationId: { type: 'string', format: 'uuid' },
                isPrimary: {
                  type: 'boolean',
                  description:
                    'The attestation the rendered definition mirrors.',
                },
                contentMode: {
                  type: 'string',
                  enum: ['QUOTED', 'SUMMARIZED', 'PARAPHRASED'],
                },
                similarityToPrimary: { type: ['number', 'null'] },
                definition: {
                  type: 'object',
                  properties: {
                    md: { type: 'string' },
                    text: { type: 'string' },
                  },
                },
                sourceLocator: {
                  description:
                    'Where in the source document the wording came from.',
                },
                extractorVersion: { type: ['string', 'null'] },
                extractedAt: { type: ['string', 'null'], format: 'date-time' },
              },
            },
          ],
        },
        Sense: {
          type: 'object',
          required: ['id', 'order', 'citations'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: ['string', 'null'] },
            order: { type: 'integer' },
            label: { type: ['string', 'null'] },
            expandedForm: { type: ['string', 'null'] },
            needsLabel: {
              type: 'boolean',
              description: 'An editor has not yet named this meaning.',
            },
            disambiguationNote: { type: ['string', 'null'] },
            isPreferred: { type: 'boolean' },
            isEditorial: { type: 'boolean' },
            editorialRationale: { type: ['string', 'null'] },
            definition: {
              type: 'object',
              properties: {
                md: { type: ['string', 'null'] },
                text: { type: ['string', 'null'] },
              },
            },
            url: {
              type: 'string',
              description: 'Entry URL with the `#s-<slug>` fragment.',
            },
            citationRecordUrl: { type: 'string' },
            examples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  md: { type: ['string', 'null'] },
                  text: { type: ['string', 'null'] },
                },
              },
            },
            citations: {
              type: 'array',
              items: { $ref: '#/components/schemas/Attestation' },
            },
          },
        },
        Entry: {
          type: 'object',
          required: ['id', 'type', 'slug', 'title', 'senses', 'license'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['TERM', 'ACRONYM'] },
            slug: { type: 'string' },
            title: { type: 'string' },
            url: { type: 'string' },
            summary: {
              type: 'object',
              properties: {
                md: { type: ['string', 'null'] },
                text: { type: ['string', 'null'] },
              },
            },
            publishedAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' },
            variants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  type: { type: 'string' },
                },
              },
            },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  kind: { type: 'string', enum: ['DOMAIN', 'FACET'] },
                  assignedBy: {
                    type: 'string',
                    enum: ['EDITORIAL', 'AUTO', 'INGEST'],
                  },
                },
              },
            },
            senses: {
              type: 'array',
              items: { $ref: '#/components/schemas/Sense' },
            },
            license: { $ref: '#/components/schemas/License' },
          },
        },
        EntryListItem: {
          type: 'object',
          required: ['id', 'type', 'slug', 'title'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['TERM', 'ACRONYM'] },
            slug: { type: 'string' },
            title: { type: 'string' },
            url: { type: 'string' },
            summaryText: { type: ['string', 'null'] },
            senseCount: { type: 'integer' },
            publishedAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                },
              },
            },
          },
        },
        Tag: {
          type: 'object',
          required: ['id', 'name', 'slug'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: ['string', 'null'] },
            kind: { type: 'string', enum: ['DOMAIN', 'FACET'] },
            parentId: { type: ['string', 'null'], format: 'uuid' },
            publishedCount: { type: 'integer' },
            url: { type: 'string' },
          },
        },
        EntrySearchResult: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
            displayTitle: { type: 'string' },
            primarySlug: { type: 'string' },
            summaryText: { type: ['string', 'null'] },
            snippet: { type: ['string', 'null'] },
            senseCount: { type: ['integer', 'null'] },
            senseSummary: { type: ['string', 'null'] },
            url: { type: 'string' },
          },
        },
        SenseSearchResult: {
          type: 'object',
          properties: {
            senseId: { type: 'string', format: 'uuid' },
            entryId: { type: 'string', format: 'uuid' },
            entryType: { type: 'string', enum: ['TERM', 'ACRONYM'] },
            entryTitle: { type: 'string' },
            entrySlug: { type: 'string' },
            senseSlug: { type: ['string', 'null'] },
            senseLabel: { type: ['string', 'null'] },
            expandedForm: { type: ['string', 'null'] },
            snippet: { type: ['string', 'null'] },
            sourceNames: { type: ['string', 'null'] },
            url: { type: 'string' },
            citationRecordUrl: { type: 'string' },
          },
        },
        SenseCitationRecord: {
          type: 'object',
          required: ['entry', 'sense', 'attestations'],
          properties: {
            entry: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                type: { type: 'string', enum: ['TERM', 'ACRONYM'] },
                slug: { type: 'string' },
                title: { type: 'string' },
                url: { type: 'string' },
              },
            },
            sense: { $ref: '#/components/schemas/Sense' },
            attestations: {
              type: 'array',
              items: { $ref: '#/components/schemas/Attestation' },
            },
            license: { $ref: '#/components/schemas/License' },
          },
        },
      },
    },
  };
}
