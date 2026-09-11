// Typed read models for the public (unauthenticated) web surface.
//
// Everything here is a pure read: no redirects, no framework imports. Callers in
// apps/web wrap these in `unstable_cache` with the documented tag set and
// translate `kind: 'redirect' | 'not-found'` into Next navigation calls.
import { Prisma } from '@prisma/client';
import type {
  ContentMode,
  EntryType,
  PrismaClient,
  RelationshipType,
} from '@prisma/client';

import { getPrismaClient } from '../client.js';
import { slugify } from '../text.js';
import type { DbClientLike } from '../client.js';
import { listPublishedRelationshipsForEntry } from './relationships.js';
import {
  countSearchResults,
  searchPublishedEntries,
  suggestSearchCorrection,
  type SearchInput,
} from './search.js';
import { listPublicSources, resolvePublicSourceBySlug } from './sources.js';
import { listTags, resolveTagBySlug } from './tags.js';

export type PublicEntryListItem = {
  id: string;
  entryType: EntryType;
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  updatedAt: Date;
  tags: Array<{ id: string; name: string; slug: string }>;
};

export type PublicSenseDefinition = {
  id: string;
  definitionMd: string;
  definitionText: string;
  contentMode: ContentMode;
  isPrimary: boolean;
  similarityToPrimary: number | null;
  sourceLocator: Prisma.JsonValue | null;
  extractorVersion: string | null;
  extractedAt: Date | null;
  citation: PublicCitation;
};

export type PublicCitation = {
  id: string;
  sourceId: string;
  url: string;
  licenseNote: string | null;
  attributionText: string | null;
  accessedAt: Date;
  source: {
    id: string;
    name: string;
    sourceSlug: string;
    trustTier: string;
    licenseUrl: string | null;
    licensePublicStatement: string | null;
    attributionHtml: string | null;
  };
  sourceDocument: {
    id: string;
    title: string | null;
    url: string;
    contentSha256: string;
  };
};

export type PublicSenseProvenanceRow = {
  id: string;
  entityId: string;
  fieldName: string;
  contentMode: ContentMode;
  extractionMethod: string;
  extractorVersion: string;
  extractedAt: Date;
  sourceLocator: Prisma.JsonValue | null;
  citation: PublicCitation;
};

export type PublicSense = {
  id: string;
  slug: string | null;
  senseOrder: number;
  senseLabel: string | null;
  expandedForm: string | null;
  needsLabel: boolean;
  disambiguationNote: string | null;
  definitionMd: string | null;
  definitionText: string | null;
  examples: Array<{
    id: string;
    exampleMd: string | null;
    exampleText: string | null;
  }>;
  definitions: PublicSenseDefinition[];
};

export type PublicEntryRelation = {
  relationshipType: RelationshipType;
  weight: number;
  note: string | null;
  otherEntry: {
    id: string;
    entryType: EntryType;
    displayTitle: string;
    primarySlug: string;
  };
};

export type PublicEntryPageRecord = {
  entry: {
    id: string;
    entryType: EntryType;
    displayTitle: string;
    primarySlug: string;
    summaryMd: string | null;
    summaryText: string | null;
    updatedAt: Date;
    entryTags: Array<{ tag: { id: string; name: string; slug: string } }>;
    variants: Array<{ variantText: string }>;
    senses: PublicSense[];
  };
  relationships: PublicEntryRelation[];
  otherSummaryById: Array<{
    id: string;
    summaryText: string | null;
    summaryMd: string | null;
  }>;
  provenance: PublicSenseProvenanceRow[];
};

export type LoadEntryPageResult =
  | { kind: 'not-found' }
  | { kind: 'redirect'; entryType: EntryType; slug: string }
  | { kind: 'ok'; data: PublicEntryPageRecord };

const citationSelect = {
  id: true,
  sourceId: true,
  url: true,
  licenseNote: true,
  attributionText: true,
  accessedAt: true,
  source: {
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      trustTier: true,
      licenseUrl: true,
      licensePublicStatement: true,
      attributionHtml: true,
    },
  },
  sourceDocument: {
    select: { id: true, title: true, url: true, contentSha256: true },
  },
} satisfies Prisma.CitationSelect;

/**
 * Resolve a published entry by slug (honouring slug history and cross-type
 * matches) and load everything the public entry page renders.
 */
async function loadEntryPage(
  db: DbClientLike,
  input: { entryType: EntryType; slug: string },
): Promise<LoadEntryPageResult> {
  const slug = input.slug.trim().toLowerCase();
  if (!slug) return { kind: 'not-found' };

  const resolved = await resolveEntryIdBySlug(db, {
    entryType: input.entryType,
    slug,
  });
  if (!resolved) return { kind: 'not-found' };

  if (
    resolved.entryType !== input.entryType ||
    resolved.canonicalSlug !== slug
  ) {
    return {
      kind: 'redirect',
      entryType: resolved.entryType,
      slug: resolved.canonicalSlug,
    };
  }

  const entry = await db.entry.findFirst({
    where: { id: resolved.entryId, status: 'PUBLISHED', deletedAt: null },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryMd: true,
      summaryText: true,
      updatedAt: true,
      variants: {
        select: { variantText: true },
        orderBy: [{ variantType: 'asc' }, { variantText: 'asc' }],
      },
      entryTags: {
        where: { tag: { deletedAt: null } },
        select: { tag: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ tag: { name: 'asc' } }],
      },
      senses: {
        where: { status: 'PUBLISHED', deletedAt: null },
        orderBy: [{ senseOrder: 'asc' }],
        select: {
          id: true,
          slug: true,
          senseOrder: true,
          senseLabel: true,
          expandedForm: true,
          needsLabel: true,
          disambiguationNote: true,
          definitionMd: true,
          definitionText: true,
          examples: {
            orderBy: [{ exampleOrder: 'asc' }],
            select: { id: true, exampleMd: true, exampleText: true },
          },
          definitions: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              definitionMd: true,
              definitionText: true,
              contentMode: true,
              isPrimary: true,
              similarityToPrimary: true,
              sourceLocator: true,
              extractorVersion: true,
              extractedAt: true,
              citation: { select: citationSelect },
            },
          },
        },
      },
    },
  });

  if (!entry) return { kind: 'not-found' };

  const senseIds = entry.senses.map((sense) => sense.id);
  const provenance = senseIds.length
    ? await db.fieldProvenance.findMany({
        where: { entityType: 'SENSE', entityId: { in: senseIds } },
        orderBy: [{ extractedAt: 'desc' }],
        select: {
          id: true,
          entityId: true,
          fieldName: true,
          contentMode: true,
          extractionMethod: true,
          extractorVersion: true,
          extractedAt: true,
          sourceLocator: true,
          citation: { select: citationSelect },
        },
      })
    : [];

  const relationships = await loadEntryRelationships(db, {
    entryId: entry.id,
    limit: 60,
  });

  const otherIds = Array.from(
    new Set(relationships.map((r) => r.otherEntry.id)),
  );
  const otherSummaryById = otherIds.length
    ? await db.entry.findMany({
        where: { id: { in: otherIds }, status: 'PUBLISHED', deletedAt: null },
        select: { id: true, summaryText: true, summaryMd: true },
      })
    : [];

  return {
    kind: 'ok',
    data: { entry, relationships, otherSummaryById, provenance },
  };
}

async function resolveEntryIdBySlug(
  db: DbClientLike,
  input: { entryType: EntryType; slug: string },
): Promise<{
  entryId: string;
  entryType: EntryType;
  canonicalSlug: string;
} | null> {
  const direct = await db.entry.findFirst({
    where: {
      entryType: input.entryType,
      primarySlug: input.slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: { id: true, entryType: true, primarySlug: true },
  });

  if (direct) {
    return {
      entryId: direct.id,
      entryType: direct.entryType,
      canonicalSlug: direct.primarySlug,
    };
  }

  const otherType: EntryType = input.entryType === 'TERM' ? 'ACRONYM' : 'TERM';
  const crossType = await db.entry.findFirst({
    where: {
      entryType: otherType,
      primarySlug: input.slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: { id: true, entryType: true, primarySlug: true },
  });

  if (crossType) {
    return {
      entryId: crossType.id,
      entryType: crossType.entryType,
      canonicalSlug: crossType.primarySlug,
    };
  }

  const history = await db.entrySlugHistory.findFirst({
    where: { slug: input.slug },
  });
  if (!history) return null;

  const historical = await db.entry.findFirst({
    where: { id: history.entryId, status: 'PUBLISHED', deletedAt: null },
    select: { id: true, entryType: true, primarySlug: true },
  });

  if (!historical) return null;

  return {
    entryId: historical.id,
    entryType: historical.entryType,
    canonicalSlug: historical.primarySlug,
  };
}

/**
 * `listPublishedRelationshipsForEntry` owns the dedupe/ranking rules; this adds
 * the editorial `note` that the public UI shows for confusable pairs.
 */
async function loadEntryRelationships(
  db: DbClientLike,
  input: { entryId: string; limit: number },
): Promise<PublicEntryRelation[]> {
  const base = await listPublishedRelationshipsForEntry(db, input);
  if (base.length === 0) return [];

  const noteRows = await db.entryRelationship.findMany({
    where: {
      deletedAt: null,
      note: { not: null },
      OR: [{ fromEntryId: input.entryId }, { toEntryId: input.entryId }],
    },
    select: {
      fromEntryId: true,
      toEntryId: true,
      relationshipType: true,
      note: true,
    },
  });

  const noteByKey = new Map<string, string>();
  for (const row of noteRows) {
    const otherId =
      row.fromEntryId === input.entryId ? row.toEntryId : row.fromEntryId;
    const note = row.note?.trim();
    if (!note) continue;
    noteByKey.set(`${row.relationshipType}:${otherId}`, note);
  }

  return base.map((item) => ({
    relationshipType: item.relationshipType,
    weight: item.weight,
    note:
      noteByKey.get(`${item.relationshipType}:${item.otherEntry.id}`) ?? null,
    otherEntry: item.otherEntry,
  }));
}

export type BrowseEntriesInput = {
  entryType: EntryType;
  letter: string;
  page: number;
  pageSize: number;
  sort: 'title' | 'updated';
  query: string;
  tagSlug: string | null;
};

export type BrowseEntriesResult = {
  activeTag: { id: string; name: string; slug: string } | null;
  tags: Array<{ id: string; name: string; slug: string }>;
  items: PublicEntryListItem[];
  total: number;
};

async function listBrowseEntries(
  db: DbClientLike,
  input: BrowseEntriesInput,
): Promise<BrowseEntriesResult> {
  const activeTag = input.tagSlug
    ? await db.tag.findFirst({
        where: { slug: input.tagSlug, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
    : null;

  const topTagAgg = await db.entryTag.groupBy({
    by: ['tagId'],
    where: {
      tag: { deletedAt: null },
      entry: {
        status: 'PUBLISHED',
        deletedAt: null,
        entryType: input.entryType,
      },
    },
    _count: { tagId: true },
    orderBy: { _count: { tagId: 'desc' } },
    take: 12,
  });

  const topTagIds = topTagAgg.map((row) => row.tagId);
  const topTags = topTagIds.length
    ? await db.tag.findMany({
        where: { id: { in: topTagIds }, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
    : [];

  const tagsById = new Map(topTags.map((tag) => [tag.id, tag] as const));
  const tags = topTagIds.flatMap((tagId) => tagsById.get(tagId) ?? []);
  if (activeTag && !tags.some((tag) => tag.id === activeTag.id)) {
    tags.unshift(activeTag);
  }

  const normalizedTitleFilter =
    input.letter === '0-9'
      ? {
          OR: Array.from({ length: 10 }, (_, number) => ({
            normalizedTitle: { startsWith: String(number) },
          })),
        }
      : { normalizedTitle: { startsWith: input.letter } };

  const queryFilter = input.query
    ? {
        OR: [
          { normalizedTitle: { contains: input.query.toLowerCase() } },
          {
            displayTitle: {
              contains: input.query,
              mode: 'insensitive' as const,
            },
          },
          {
            summaryText: {
              contains: input.query,
              mode: 'insensitive' as const,
            },
          },
        ],
      }
    : {};

  const where: Prisma.EntryWhereInput = {
    entryType: input.entryType,
    status: 'PUBLISHED',
    deletedAt: null,
    ...normalizedTitleFilter,
    ...queryFilter,
  };
  if (activeTag) where.entryTags = { some: { tagId: activeTag.id } };

  const [rows, total] = await Promise.all([
    db.entry.findMany({
      where,
      select: {
        id: true,
        entryType: true,
        displayTitle: true,
        primarySlug: true,
        summaryText: true,
        updatedAt: true,
        entryTags: {
          where: { tag: { deletedAt: null } },
          select: { tag: { select: { id: true, name: true, slug: true } } },
          orderBy: [{ tag: { name: 'asc' } }],
        },
      },
      orderBy:
        input.sort === 'updated'
          ? [{ updatedAt: 'desc' }, { normalizedTitle: 'asc' }]
          : [{ normalizedTitle: 'asc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.entry.count({ where }),
  ]);

  return {
    activeTag,
    tags,
    total,
    items: rows.map((row) => ({
      id: row.id,
      entryType: row.entryType,
      displayTitle: row.displayTitle,
      primarySlug: row.primarySlug,
      summaryText: row.summaryText,
      updatedAt: row.updatedAt,
      tags: row.entryTags.map((link) => link.tag),
    })),
  };
}

async function listRecentEntriesPage(
  db: DbClientLike,
  input: { page: number; pageSize: number },
): Promise<{ items: PublicEntryListItem[]; total: number }> {
  const where: Prisma.EntryWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
  };

  const [rows, total] = await Promise.all([
    db.entry.findMany({
      where,
      select: {
        id: true,
        entryType: true,
        displayTitle: true,
        primarySlug: true,
        summaryText: true,
        updatedAt: true,
        entryTags: {
          where: { tag: { deletedAt: null } },
          select: { tag: { select: { id: true, name: true, slug: true } } },
          orderBy: [{ tag: { name: 'asc' } }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.entry.count({ where }),
  ]);

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      entryType: row.entryType,
      displayTitle: row.displayTitle,
      primarySlug: row.primarySlug,
      summaryText: row.summaryText,
      updatedAt: row.updatedAt,
      tags: row.entryTags.map((link) => link.tag),
    })),
  };
}

async function listTagEntriesPage(
  db: DbClientLike,
  input: {
    tagId: string;
    entryType?: EntryType;
    page: number;
    pageSize: number;
  },
): Promise<{ items: PublicEntryListItem[]; total: number }> {
  const entryFilter: Prisma.EntryWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
  };
  if (input.entryType) entryFilter.entryType = input.entryType;

  const where: Prisma.EntryTagWhereInput = {
    tagId: input.tagId,
    entry: entryFilter,
  };

  const [rows, total] = await Promise.all([
    db.entryTag.findMany({
      where,
      select: {
        entry: {
          select: {
            id: true,
            entryType: true,
            displayTitle: true,
            primarySlug: true,
            summaryText: true,
            updatedAt: true,
            entryTags: {
              where: { tag: { deletedAt: null } },
              select: { tag: { select: { id: true, name: true, slug: true } } },
              orderBy: [{ tag: { name: 'asc' } }],
            },
          },
        },
      },
      orderBy: [{ entry: { normalizedTitle: 'asc' } }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.entryTag.count({ where }),
  ]);

  return {
    total,
    items: rows.map((row) => ({
      id: row.entry.id,
      entryType: row.entry.entryType,
      displayTitle: row.entry.displayTitle,
      primarySlug: row.entry.primarySlug,
      summaryText: row.entry.summaryText,
      updatedAt: row.entry.updatedAt,
      tags: row.entry.entryTags.map((link) => link.tag),
    })),
  };
}

export type PublicSourceListRow = {
  id: string;
  citedCount: number;
  latestAccessedAt: Date | null;
};

async function listSourceCitationStats(
  db: PrismaClient,
  input: { sourceIds: string[] },
): Promise<PublicSourceListRow[]> {
  if (input.sourceIds.length === 0) return [];

  return db.$queryRaw<PublicSourceListRow[]>(Prisma.sql`
    SELECT
      c.source_id AS "id",
      COUNT(DISTINCT e.id)::int AS "citedCount",
      MAX(c.accessed_at) AS "latestAccessedAt"
    FROM citations c
    LEFT JOIN field_provenance fp
      ON fp.citation_id = c.id AND fp.entity_type = 'SENSE'
    LEFT JOIN senses s
      ON s.id = fp.entity_id AND s.status = 'PUBLISHED' AND s.deleted_at IS NULL
    LEFT JOIN entries e
      ON e.id = s.entry_id AND e.status = 'PUBLISHED' AND e.deleted_at IS NULL
    WHERE c.source_id IN (${Prisma.join(input.sourceIds.map((id) => Prisma.sql`${id}::uuid`))})
    GROUP BY c.source_id
  `);
}

async function listSourceCitedEntries(
  db: PrismaClient,
  input: { sourceId: string; page: number; pageSize: number },
): Promise<{ items: PublicEntryListItem[]; total: number }> {
  const offset = (input.page - 1) * input.pageSize;

  const totalRows = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT e.id)::int AS "count"
    FROM entries e
    JOIN senses s ON s.entry_id = e.id
    JOIN field_provenance fp ON fp.entity_type = 'SENSE' AND fp.entity_id = s.id
    JOIN citations c ON c.id = fp.citation_id
    WHERE e.status = 'PUBLISHED'
      AND e.deleted_at IS NULL
      AND s.status = 'PUBLISHED'
      AND s.deleted_at IS NULL
      AND c.source_id = ${input.sourceId}::uuid
  `);

  const total = totalRows[0]?.count ?? 0;

  type Row = {
    id: string;
    entryType: EntryType;
    displayTitle: string;
    primarySlug: string;
    summaryText: string | null;
    updatedAt: Date;
  };

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT DISTINCT
      e.id AS "id",
      e.entry_type AS "entryType",
      e.display_title AS "displayTitle",
      e.primary_slug AS "primarySlug",
      e.summary_text AS "summaryText",
      e.updated_at AS "updatedAt",
      e.normalized_title AS "normalizedTitle"
    FROM entries e
    JOIN senses s ON s.entry_id = e.id
    JOIN field_provenance fp ON fp.entity_type = 'SENSE' AND fp.entity_id = s.id
    JOIN citations c ON c.id = fp.citation_id
    WHERE e.status = 'PUBLISHED'
      AND e.deleted_at IS NULL
      AND s.status = 'PUBLISHED'
      AND s.deleted_at IS NULL
      AND c.source_id = ${input.sourceId}::uuid
    ORDER BY e.normalized_title ASC
    LIMIT ${input.pageSize} OFFSET ${offset}
  `);

  const ids = rows.map((row) => row.id);
  const tagRows = ids.length
    ? await db.entryTag.findMany({
        where: { entryId: { in: ids }, tag: { deletedAt: null } },
        select: {
          entryId: true,
          tag: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ tag: { name: 'asc' } }],
      })
    : [];

  const tagsByEntryId = new Map<
    string,
    Array<{ id: string; name: string; slug: string }>
  >();
  for (const row of tagRows) {
    const list = tagsByEntryId.get(row.entryId) ?? [];
    list.push(row.tag);
    tagsByEntryId.set(row.entryId, list);
  }

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      entryType: row.entryType,
      displayTitle: row.displayTitle,
      primarySlug: row.primarySlug,
      summaryText: row.summaryText,
      updatedAt: row.updatedAt,
      tags: tagsByEntryId.get(row.id) ?? [],
    })),
  };
}

/** Tags whose name/slug loosely matches the query, shown on empty search. */
async function listTagsMatchingQuery(
  db: DbClientLike,
  input: { query: string; limit: number },
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const query = input.query.trim();
  if (!query) return [];

  return db.tag.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { slug: { contains: slugify(query) } },
      ],
      entryTags: { some: { entry: { status: 'PUBLISHED', deletedAt: null } } },
    },
    select: { id: true, name: true, slug: true },
    orderBy: [{ name: 'asc' }],
    take: Math.max(1, Math.min(20, input.limit)),
  });
}

export type SitemapEntryRow = { primarySlug: string; updatedAt: Date };

async function listSitemapEntries(
  db: DbClientLike,
  input: { entryType: EntryType; offset: number; limit: number },
): Promise<SitemapEntryRow[]> {
  return db.entry.findMany({
    where: { status: 'PUBLISHED', deletedAt: null, entryType: input.entryType },
    select: { primarySlug: true, updatedAt: true },
    orderBy: [{ normalizedTitle: 'asc' }],
    skip: input.offset,
    take: input.limit,
  });
}

async function countSitemapEntries(
  db: DbClientLike,
  input: { entryType: EntryType },
): Promise<number> {
  return db.entry.count({
    where: { status: 'PUBLISHED', deletedAt: null, entryType: input.entryType },
  });
}

/** Tags that have at least one published entry (zero-entry tags are excluded). */
async function listSitemapTags(
  db: DbClientLike,
): Promise<Array<{ slug: string; updatedAt: Date }>> {
  return db.tag.findMany({
    where: {
      deletedAt: null,
      entryTags: { some: { entry: { status: 'PUBLISHED', deletedAt: null } } },
    },
    select: { slug: true, updatedAt: true },
    orderBy: [{ slug: 'asc' }],
  });
}

async function listSitemapSources(
  db: DbClientLike,
): Promise<Array<{ sourceSlug: string; updatedAt: Date }>> {
  return db.source.findMany({
    where: { enabled: true },
    select: { sourceSlug: true, updatedAt: true },
    orderBy: [{ sourceSlug: 'asc' }],
  });
}

export type SitemapLastmods = {
  terms: Date | null;
  acronyms: Date | null;
  tags: Date | null;
  sources: Date | null;
};

/** Max(updatedAt) per child sitemap, so the index reports real lastmods. */
async function getSitemapLastmods(db: DbClientLike): Promise<SitemapLastmods> {
  const [terms, acronyms, tags, sources] = await Promise.all([
    db.entry.aggregate({
      where: { status: 'PUBLISHED', deletedAt: null, entryType: 'TERM' },
      _max: { updatedAt: true },
    }),
    db.entry.aggregate({
      where: { status: 'PUBLISHED', deletedAt: null, entryType: 'ACRONYM' },
      _max: { updatedAt: true },
    }),
    db.tag.aggregate({
      where: {
        deletedAt: null,
        entryTags: {
          some: { entry: { status: 'PUBLISHED', deletedAt: null } },
        },
      },
      _max: { updatedAt: true },
    }),
    db.source.aggregate({
      where: { enabled: true },
      _max: { updatedAt: true },
    }),
  ]);

  return {
    terms: terms._max.updatedAt ?? null,
    acronyms: acronyms._max.updatedAt ?? null,
    tags: tags._max.updatedAt ?? null,
    sources: sources._max.updatedAt ?? null,
  };
}

/**
 * The public read surface, with the Prisma client already bound. `apps/web` is
 * forbidden by lint from importing a Prisma client, so public pages consume
 * this namespace instead; it is the only export of this module.
 */
export const publicReads = {
  entryPage: (input: { entryType: EntryType; slug: string }) =>
    loadEntryPage(getPrismaClient(), input),

  browseEntries: (input: BrowseEntriesInput) =>
    listBrowseEntries(getPrismaClient(), input),

  recentEntries: (input: { page: number; pageSize: number }) =>
    listRecentEntriesPage(getPrismaClient(), input),

  tagDirectory: () => listTags(getPrismaClient()),

  tagBySlug: (input: { slug: string }) =>
    resolveTagBySlug(getPrismaClient(), input),

  tagEntries: (input: {
    tagId: string;
    entryType?: EntryType;
    page: number;
    pageSize: number;
  }) => listTagEntriesPage(getPrismaClient(), input),

  tagsMatchingQuery: (input: { query: string; limit: number }) =>
    listTagsMatchingQuery(getPrismaClient(), input),

  sources: () => listPublicSources(getPrismaClient()),

  sourceBySlug: (input: { slug: string }) =>
    resolvePublicSourceBySlug(getPrismaClient(), input),

  sourceCitationStats: (input: { sourceIds: string[] }) =>
    listSourceCitationStats(getPrismaClient(), input),

  sourceCitedEntries: (input: {
    sourceId: string;
    page: number;
    pageSize: number;
  }) => listSourceCitedEntries(getPrismaClient(), input),

  search: (input: SearchInput) =>
    searchPublishedEntries(getPrismaClient(), input),

  searchTotal: (input: Omit<SearchInput, 'page' | 'pageSize'>) =>
    countSearchResults(getPrismaClient(), input),

  searchSuggestion: (input: { query: string; entryType?: EntryType }) =>
    suggestSearchCorrection(getPrismaClient(), input),

  sitemapEntries: (input: {
    entryType: EntryType;
    offset: number;
    limit: number;
  }) => listSitemapEntries(getPrismaClient(), input),

  sitemapEntryCount: (input: { entryType: EntryType }) =>
    countSitemapEntries(getPrismaClient(), input),

  sitemapTags: () => listSitemapTags(getPrismaClient()),

  sitemapSources: () => listSitemapSources(getPrismaClient()),

  sitemapLastmods: () => getSitemapLastmods(getPrismaClient()),
} as const;
