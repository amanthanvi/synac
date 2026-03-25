import { describe, expect, it } from 'vitest';

import {
  AUTO_TAG_DEFINITIONS,
  collectAutoTagSlugsForDocument,
  ensureMissingAutoTagDefinitions,
  shouldCreateAutoTagDefinition,
} from './autoTagging.js';

describe('auto tagging', () => {
  it('exposes the same curated tag catalog used by scripts', () => {
    expect(AUTO_TAG_DEFINITIONS.length).toBeGreaterThan(10);
    expect(AUTO_TAG_DEFINITIONS.map((definition) => definition.slug)).toContain('identity');
    expect(AUTO_TAG_DEFINITIONS.map((definition) => definition.slug)).toContain(
      'application-security',
    );
  });

  it('collects matching slugs from a search document', () => {
    const slugs = collectAutoTagSlugsForDocument(`
      Authentication tokens can be stolen through phishing and SSRF chains.
      A SIEM alert helped incident response teams investigate the compromise.
    `);

    expect(slugs).toEqual([
      'identity',
      'application-security',
      'threats',
      'security-operations',
      'incident-response',
    ]);
  });

  it('returns matching tag slugs for a search document', () => {
    const matched = collectAutoTagSlugsForDocument(
      'SAML authentication token federation over tls with identity provider support.',
    );

    expect(matched).toContain('identity');
    expect(matched).toContain('cryptography');
  });

  it('returns unique slugs without false duplicates', () => {
    const matched = collectAutoTagSlugsForDocument(
      'Authentication authorization authentication authorization.',
    );

    expect(matched.filter((slug) => slug === 'identity')).toHaveLength(1);
    expect(matched.filter((slug) => slug === 'access-control')).toHaveLength(1);
  });

  it('returns no tags for an empty document', () => {
    expect(collectAutoTagSlugsForDocument('   ')).toEqual([]);
  });

  it('only auto-creates missing tags and never revives deleted ones', () => {
    expect(shouldCreateAutoTagDefinition(null)).toBe(true);
    expect(shouldCreateAutoTagDefinition({ deletedAt: null })).toBe(false);
    expect(shouldCreateAutoTagDefinition({ deletedAt: new Date('2026-03-24T00:00:00.000Z') })).toBe(
      false,
    );
  });

  it('ensures only missing definitions without overwriting existing curated metadata', async () => {
    const updates: unknown[] = [];
    const creates: unknown[] = [];

    const db = {
      tag: {
        findFirst: async ({ where }: { where: { slug: string } }) => {
          if (where.slug === 'identity') {
            return { id: 'tag-1', slug: 'identity', deletedAt: null };
          }

          return null;
        },
        create: async ({ data }: { data: { name: string; slug: string; description: string } }) => {
          creates.push(data);
          return { id: `created-${data.slug}`, slug: data.slug };
        },
        update: async ({ data }: { data: unknown }) => {
          updates.push(data);
          return { id: 'tag-1', slug: 'identity' };
        },
      },
    } as never;

    const tags = await ensureMissingAutoTagDefinitions(db, {
      slugs: ['identity', 'privacy'],
    });

    expect(tags.some((tag) => tag.slug === 'identity')).toBe(true);
    expect(updates).toHaveLength(0);
    expect(creates.length).toBeGreaterThan(0);
  });
});
