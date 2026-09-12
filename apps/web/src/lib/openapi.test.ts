import { describe, expect, test } from 'vitest';

import { buildOpenApiDocument } from './openapi';

/**
 * The contract the document keeps: adding a route without describing it here
 * fails this list, and a described route that loses its operation fails below.
 */
const EXPECTED_PATHS = [
  '/api/healthz',
  '/api/v1/acronyms',
  '/api/v1/entries/by-slug',
  '/api/v1/export/entries.json',
  '/api/v1/openapi.json',
  '/api/v1/search',
  '/api/v1/senses/citation.json',
  '/api/v1/sources',
  '/api/v1/sources/{slug}',
  '/api/v1/tags',
  '/api/v1/terms',
];

const document = buildOpenApiDocument();

describe('buildOpenApiDocument', () => {
  test('is an OpenAPI 3.1 document with a server url', () => {
    expect(document.openapi.startsWith('3.1')).toBe(true);
    expect(document.servers).toHaveLength(1);
    expect(document.servers[0]?.url).toMatch(/^https?:\/\//);
    expect(document.servers[0]?.url.endsWith('/')).toBe(false);
  });

  test('describes exactly the routes that exist', () => {
    expect(Object.keys(document.paths).sort()).toEqual([...EXPECTED_PATHS]);
  });

  test('every path is under /api/', () => {
    for (const path of Object.keys(document.paths)) {
      expect(path.startsWith('/api/')).toBe(true);
    }
  });

  test('every path has an operation with an operationId and a 200', () => {
    const operationIds = new Set<string>();
    for (const [path, item] of Object.entries(document.paths)) {
      const operations = [item.get, item.options].filter(
        (operation) => operation !== undefined,
      );
      expect(operations.length, path).toBeGreaterThan(0);
      for (const operation of operations) {
        expect(operation.operationId, path).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(operationIds.has(operation.operationId), path).toBe(false);
        operationIds.add(operation.operationId);
        expect(Object.keys(operation.responses), path).toContain('200');
      }
    }
  });

  test('every $ref points at a schema that exists', () => {
    const names = new Set(Object.keys(document.components.schemas));
    const refs = JSON.stringify(document).match(
      /#\/components\/schemas\/[A-Za-z]+/g,
    );
    expect(refs?.length ?? 0).toBeGreaterThan(0);
    for (const reference of refs ?? []) {
      expect(names).toContain(reference.split('/').pop());
    }
  });
});
