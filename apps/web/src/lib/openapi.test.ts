import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { RATE_LIMIT_PER_MINUTE } from '../../../../convex/rateLimitPolicy';
import { buildOpenApiDocument } from './openapi';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

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

  test('documents the separate search and read budgets', () => {
    const description = document.info.description;
    expect(description).toContain(
      `${RATE_LIMIT_PER_MINUTE.search} requests per minute`,
    );
    expect(description).toContain(
      `${RATE_LIMIT_PER_MINUTE.api_read} requests per minute`,
    );
    expect(description).toContain(
      'Exhausting one budget does not exhaust the other',
    );
    expect(
      document.paths['/api/v1/search']?.get?.responses['429']?.description,
    ).toContain(`${RATE_LIMIT_PER_MINUTE.search} requests per minute`);
    expect(
      document.paths['/api/v1/terms']?.get?.responses['429']?.description,
    ).toContain(`${RATE_LIMIT_PER_MINUTE.api_read} per minute`);

    const apiDoc = readFileSync(path.join(repoRoot, 'docs/api.md'), 'utf8');
    expect(apiDoc).toContain(
      `${RATE_LIMIT_PER_MINUTE.search} requests per minute`,
    );
    expect(apiDoc).toContain(
      `${RATE_LIMIT_PER_MINUTE.api_read} requests per minute`,
    );
    expect(apiDoc).toContain(
      `${RATE_LIMIT_PER_MINUTE.csp_report} requests per minute`,
    );
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
