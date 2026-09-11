// Public (unauthenticated) read queries. Owned by the public web surface;
// apps/web must import these instead of touching Prisma directly.
//
// These are the primitives behind `/api/v1/*` and are equally usable from a
// page loader: pure reads, no framework imports, no redirects. Every shape that
// carries a definition also carries the citation and source licence metadata
// beside it, so a consumer of the API inherits attribution rather than having
// to reassemble it.
import { Prisma } from '@prisma/client';
import type {
  ContentMode,
  EntryType,
  LicenseType,
  PrismaClient,
  SourceTrustTier,
  TagAssignment,
  TagKind,
} from '@prisma/client';

import type { DbClientLike } from '../client.js';

export type PublicSourceRef = {
  id: string;
  name: string;
  sourceSlug: string;
  baseUrl: string;
  trustTier: SourceTrustTier;
  licenseType: LicenseType;
  licenseUrl: string | null;
  licensePublicStatement: string | null;
  attributionHtml: string | null;
  attributionRequirements: string;
};

export type PublicCitationRef = {
  id: string;
  url: string;
  citationText: string | null;
  licenseNote: string | null;
  attributionText: string | null;
  accessedAt: Date;
  source: PublicSourceRef;
  sourceDocument: {
    id: string;
    title: string | null;
    url: string;
    canonicalUrl: string | null;
    contentSha256: string;
    fetchedAt: Date;
  };
};

export type PublicAttestation = {
  id: string;
  definitionMd: string;
  definitionText: string;
  contentMode: ContentMode;
  isPrimary: boolean;
  similarityToPrimary: number | null;
  sourceLocator: Prisma.JsonValue | null;
  extractorVersion: string | null;
  extractedAt: Date | null;
  citation: PublicCitationRef;
};

export type PublicApiSense = {
  id: string;
  slug: string | null;
  senseOrder: number;
  senseLabel: string | null;
  expandedForm: string | null;
  needsLabel: boolean;
  disambiguationNote: string | null;
  definitionMd: string | null;
  definitionText: string | null;
  isPreferred: boolean;
  isEditorial: boolean;
  editorialRationale: string | null;
  examples: Array<{
    id: string;
    exampleMd: string | null;
    exampleText: string | null;
  }>;
  definitions: PublicAttestation[];
};

export type PublicApiEntry = {
  id: string;
  entryType: EntryType;
  displayTitle: string;
  primarySlug: string;
  summaryMd: string | null;
  summaryText: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  variants: Array<{ variantText: string; variantType: string }>;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    kind: TagKind;
    assignedBy: TagAssignment;
  }>;
  senses: PublicApiSense[];
};

export type PublicApiEntryListItem = {
  id: string;
  entryType: EntryType;
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
  senseCount: number;
  tags: Array<{ id: string; name: string; slug: string }>;
};

export type PublicApiTag = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: TagKind;
  parentId: string | null;
  publishedCount: number;
};

export type PublicApiSource = PublicSourceRef & {
  licenseNotes: string | null;
  tierRationale: string | null;
  snapshotAllowed: boolean;
  defaultContentMode: ContentMode;
  allowedUse: string;
  lastVerifiedAt: Date | null;
  updatedAt: Date;
  citedEntryCount: number;
  citationCount: number;
  latestAccessedAt: Date | null;
};

export type PublicSenseCitationRecord = {
  entry: {
    id: string;
    entryType: EntryType;
    displayTitle: string;
    primarySlug: string;
  };
  sense: {
    id: string;
    slug: string | null;
    senseOrder: number;
    senseLabel: string | null;
    expandedForm: string | null;
    needsLabel: boolean;
    disambiguationNote: string | null;
    definitionMd: string | null;
    definitionText: string | null;
  };
  attestations: Array<{
    id: string;
    isPrimary: boolean;
    contentMode: ContentMode;
    similarityToPrimary: number | null;
    definitionText: string;
    extractorVersion: string | null;
    extractedAt: Date | null;
    sourceLocator: Prisma.JsonValue | null;
    citation: PublicCitationRef;
  }>;
};

const sourceRefSelect = {
  id: true,
  name: true,
  sourceSlug: true,
  baseUrl: true,
  trustTier: true,
  licenseType: true,
  licenseUrl: true,
  licensePublicStatement: true,
  attributionHtml: true,
  attributionRequirements: true,
} satisfies Prisma.SourceSelect;

const citationRefSelect = {
  id: true,
  url: true,
  citationText: true,
  licenseNote: true,
  attributionText: true,
  accessedAt: true,
  source: { select: sourceRefSelect },
  sourceDocument: {
    select: {
      id: true,
      title: true,
      url: true,
      canonicalUrl: true,
      contentSha256: true,
      fetchedAt: true,
    },
  },
} satisfies Prisma.CitationSelect;

const attestationSelect = {
  id: true,
  definitionMd: true,
  definitionText: true,
  contentMode: true,
  isPrimary: true,
  similarityToPrimary: true,
  sourceLocator: true,
  extractorVersion: true,
  extractedAt: true,
  citation: { select: citationRefSelect },
} satisfies Prisma.SenseDefinitionSelect;

const publishedSenseSelect = {
  id: true,
  slug: true,
  senseOrder: true,
  senseLabel: true,
  expandedForm: true,
  needsLabel: true,
  disambiguationNote: true,
  definitionMd: true,
  definitionText: true,
  isPreferred: true,
  isEditorial: true,
  editorialRationale: true,
  examples: {
    orderBy: [{ exampleOrder: 'asc' }],
    select: { id: true, exampleMd: true, exampleText: true },
  },
  definitions: {
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: attestationSelect,
  },
} satisfies Prisma.SenseSelect;

const publishedEntrySelect = {
  id: true,
  entryType: true,
  displayTitle: true,
  primarySlug: true,
  summaryMd: true,
  summaryText: true,
  publishedAt: true,
  updatedAt: true,
  variants: {
    select: { variantText: true, variantType: true },
    orderBy: [{ variantType: 'asc' }, { variantText: 'asc' }],
  },
  entryTags: {
    where: { tag: { deletedAt: null } },
    select: {
      assignedBy: true,
      tag: { select: { id: true, name: true, slug: true, kind: true } },
    },
    orderBy: [{ tag: { name: 'asc' } }],
  },
  senses: {
    where: { status: 'PUBLISHED' as const, deletedAt: null },
    orderBy: [{ senseOrder: 'asc' }],
    select: publishedSenseSelect,
  },
} satisfies Prisma.EntrySelect;

type RawPublishedEntry = Prisma.EntryGetPayload<{
  select: typeof publishedEntrySelect;
}>;

function shapeEntry(row: RawPublishedEntry): PublicApiEntry {
  return {
    id: row.id,
    entryType: row.entryType,
    displayTitle: row.displayTitle,
    primarySlug: row.primarySlug,
    summaryMd: row.summaryMd,
    summaryText: row.summaryText,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    variants: row.variants.map((variant) => ({
      variantText: variant.variantText,
      variantType: variant.variantType,
    })),
    tags: row.entryTags.map((link) => ({
      id: link.tag.id,
      name: link.tag.name,
      slug: link.tag.slug,
      kind: link.tag.kind,
      assignedBy: link.assignedBy,
    })),
    senses: row.senses,
  };
}

/**
 * One published entry with everything an API consumer needs to render and
 * attribute it. Slug history is honoured, so a renamed entry keeps resolving
 * under its old slug; `null` means no published entry matches.
 */
export async function getPublishedEntryBySlug(
  db: DbClientLike,
  input: { entryType: EntryType; slug: string },
): Promise<PublicApiEntry | null> {
  const slug = input.slug.trim().toLowerCase();
  if (!slug) return null;

  const direct = await db.entry.findFirst({
    where: {
      entryType: input.entryType,
      primarySlug: slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    select: publishedEntrySelect,
  });
  if (direct) return shapeEntry(direct);

  const history = await db.entrySlugHistory.findFirst({
    where: { entryType: input.entryType, slug },
    select: { entryId: true },
  });
  if (!history) return null;

  const historical = await db.entry.findFirst({
    where: { id: history.entryId, status: 'PUBLISHED', deletedAt: null },
    select: publishedEntrySelect,
  });

  return historical ? shapeEntry(historical) : null;
}

/** One published entry by id. */
export async function getPublishedEntryById(
  db: DbClientLike,
  input: { id: string },
): Promise<PublicApiEntry | null> {
  const row = await db.entry.findFirst({
    where: { id: input.id, status: 'PUBLISHED', deletedAt: null },
    select: publishedEntrySelect,
  });

  return row ? shapeEntry(row) : null;
}

export type ListPublishedEntriesInput = {
  entryType?: EntryType;
  /** `a`-`z`, or `0-9` for titles starting with a digit. */
  letter?: string;
  tagSlug?: string;
  query?: string;
  sort: 'title' | 'updated';
  page: number;
  pageSize: number;
};

function letterFilter(letter: string | undefined): Prisma.EntryWhereInput {
  if (!letter) return {};

  const normalized = letter.trim().toLowerCase();
  if (normalized === '0-9') {
    return {
      OR: Array.from({ length: 10 }, (_, digit) => ({
        normalizedTitle: { startsWith: String(digit) },
      })),
    };
  }

  if (!/^[a-z]$/.test(normalized)) return {};
  return { normalizedTitle: { startsWith: normalized } };
}

/**
 * The browse/list primitive behind `/api/v1/terms`, `/acronyms`, and the public
 * index pages. Substring matching only; ranked relevance lives in
 * `searchPublishedEntries`.
 */
export async function listPublishedEntries(
  db: DbClientLike,
  input: ListPublishedEntriesInput,
): Promise<{ items: PublicApiEntryListItem[]; total: number }> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));
  const query = input.query?.trim() ?? '';
  const tagSlug = input.tagSlug?.trim().toLowerCase();

  const where: Prisma.EntryWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
    ...letterFilter(input.letter),
  };
  if (input.entryType) where.entryType = input.entryType;
  if (tagSlug) {
    where.entryTags = { some: { tag: { slug: tagSlug, deletedAt: null } } };
  }
  if (query) {
    where.OR = [
      { normalizedTitle: { contains: query.toLowerCase() } },
      { displayTitle: { contains: query, mode: 'insensitive' } },
      { summaryText: { contains: query, mode: 'insensitive' } },
    ];
  }

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
        publishedAt: true,
        entryTags: {
          where: { tag: { deletedAt: null } },
          select: { tag: { select: { id: true, name: true, slug: true } } },
          orderBy: [{ tag: { name: 'asc' } }],
        },
        _count: {
          select: {
            senses: { where: { status: 'PUBLISHED', deletedAt: null } },
          },
        },
      },
      orderBy:
        input.sort === 'updated'
          ? [{ updatedAt: 'desc' }, { normalizedTitle: 'asc' }]
          : [{ normalizedTitle: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
      publishedAt: row.publishedAt,
      senseCount: row._count.senses,
      tags: row.entryTags.map((link) => link.tag),
    })),
  };
}

/** Every non-deleted tag with its published-entry count. */
export async function listPublicTags(
  db: DbClientLike,
): Promise<PublicApiTag[]> {
  const [tags, counts] = await Promise.all([
    db.tag.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        kind: true,
        parentId: true,
      },
      orderBy: [{ name: 'asc' }],
    }),
    db.entryTag.groupBy({
      by: ['tagId'],
      where: {
        tag: { deletedAt: null },
        entry: { status: 'PUBLISHED', deletedAt: null },
      },
      _count: { tagId: true },
    }),
  ]);

  const countByTagId = new Map(
    counts.map((row) => [row.tagId, row._count.tagId] as const),
  );

  return tags.map((tag) => ({
    ...tag,
    publishedCount: countByTagId.get(tag.id) ?? 0,
  }));
}

/** Resolve a tag by current slug or by slug history. */
export async function getPublicTagBySlug(
  db: DbClientLike,
  input: { slug: string },
): Promise<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: TagKind;
  parentId: string | null;
} | null> {
  const slug = input.slug.trim().toLowerCase();
  if (!slug) return null;

  const select = {
    id: true,
    name: true,
    slug: true,
    description: true,
    kind: true,
    parentId: true,
  } satisfies Prisma.TagSelect;

  const direct = await db.tag.findFirst({
    where: { slug, deletedAt: null },
    select,
  });
  if (direct) return direct;

  const history = await db.tagSlugHistory.findFirst({
    where: { slug },
    select: { tagId: true },
  });
  if (!history) return null;

  return db.tag.findFirst({
    where: { id: history.tagId, deletedAt: null },
    select,
  });
}

type SourceStatRow = {
  id: string;
  citedEntryCount: number;
  citationCount: number;
  latestAccessedAt: Date | null;
};

/**
 * Enabled sources with citation statistics. A source's "cited entry count" is
 * distinct published entries with at least one published sense attested by that
 * source, counted across both `sense_definitions` and `field_provenance` so it
 * stays accurate through the attestation migration.
 */
export async function listPublicSourcesWithStats(
  db: PrismaClient,
): Promise<PublicApiSource[]> {
  const sources = await db.source.findMany({
    where: { enabled: true },
    select: {
      ...sourceRefSelect,
      licenseNotes: true,
      tierRationale: true,
      snapshotAllowed: true,
      defaultContentMode: true,
      allowedUse: true,
      lastVerifiedAt: true,
      updatedAt: true,
    },
    orderBy: [{ name: 'asc' }],
  });

  if (sources.length === 0) return [];

  const stats = await db.$queryRaw<SourceStatRow[]>(Prisma.sql`
    SELECT
      c.source_id AS "id",
      COUNT(DISTINCT e.id)::int AS "citedEntryCount",
      COUNT(DISTINCT c.id)::int AS "citationCount",
      MAX(c.accessed_at) AS "latestAccessedAt"
    FROM citations c
    LEFT JOIN senses s
      ON s.status = 'PUBLISHED'
     AND s.deleted_at IS NULL
     AND (
       s.id IN (SELECT sd.sense_id FROM sense_definitions sd WHERE sd.citation_id = c.id)
       OR s.id IN (
         SELECT fp.entity_id FROM field_provenance fp
         WHERE fp.citation_id = c.id AND fp.entity_type = 'SENSE'
       )
     )
    LEFT JOIN entries e
      ON e.id = s.entry_id AND e.status = 'PUBLISHED' AND e.deleted_at IS NULL
    WHERE c.source_id IN (${Prisma.join(sources.map((s) => Prisma.sql`${s.id}::uuid`))})
    GROUP BY c.source_id
  `);

  const statsById = new Map(stats.map((row) => [row.id, row] as const));

  return sources.map((source) => {
    const stat = statsById.get(source.id);
    return {
      ...source,
      citedEntryCount: stat?.citedEntryCount ?? 0,
      citationCount: stat?.citationCount ?? 0,
      latestAccessedAt: stat?.latestAccessedAt ?? null,
    };
  });
}

/** One source plus a page of the published entries it attests. */
export async function getPublicSourceWithEntries(
  db: PrismaClient,
  input: { slug: string; page: number; pageSize: number },
): Promise<{
  source: PublicApiSource;
  items: PublicApiEntryListItem[];
  total: number;
} | null> {
  const slug = input.slug.trim().toLowerCase();
  if (!slug) return null;

  const all = await listPublicSourcesWithStats(db);
  const source = all.find((row) => row.sourceSlug === slug);
  if (!source) return null;

  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize)));

  const where: Prisma.EntryWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
    senses: {
      some: {
        status: 'PUBLISHED',
        deletedAt: null,
        definitions: { some: { citation: { sourceId: source.id } } },
      },
    },
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
        publishedAt: true,
        entryTags: {
          where: { tag: { deletedAt: null } },
          select: { tag: { select: { id: true, name: true, slug: true } } },
          orderBy: [{ tag: { name: 'asc' } }],
        },
        _count: {
          select: {
            senses: { where: { status: 'PUBLISHED', deletedAt: null } },
          },
        },
      },
      orderBy: [{ normalizedTitle: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.entry.count({ where }),
  ]);

  return {
    source,
    total,
    items: rows.map((row) => ({
      id: row.id,
      entryType: row.entryType,
      displayTitle: row.displayTitle,
      primarySlug: row.primarySlug,
      summaryText: row.summaryText,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      senseCount: row._count.senses,
      tags: row.entryTags.map((link) => link.tag),
    })),
  };
}

/**
 * The machine-readable citation record for a single published sense: every
 * source that attests this meaning, with the exact document, hash, and locator
 * the wording came from. Backs `GET /api/v1/senses/{id}/citation.json`.
 */
export async function getSenseCitationRecord(
  db: DbClientLike,
  input: { senseId: string },
): Promise<PublicSenseCitationRecord | null> {
  const sense = await db.sense.findFirst({
    where: { id: input.senseId, status: 'PUBLISHED', deletedAt: null },
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
      entry: {
        select: {
          id: true,
          entryType: true,
          displayTitle: true,
          primarySlug: true,
          status: true,
          deletedAt: true,
        },
      },
      definitions: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          isPrimary: true,
          contentMode: true,
          similarityToPrimary: true,
          definitionText: true,
          extractorVersion: true,
          extractedAt: true,
          sourceLocator: true,
          citation: { select: citationRefSelect },
        },
      },
    },
  });

  if (!sense) return null;
  if (sense.entry.status !== 'PUBLISHED' || sense.entry.deletedAt) return null;

  return {
    entry: {
      id: sense.entry.id,
      entryType: sense.entry.entryType,
      displayTitle: sense.entry.displayTitle,
      primarySlug: sense.entry.primarySlug,
    },
    sense: {
      id: sense.id,
      slug: sense.slug,
      senseOrder: sense.senseOrder,
      senseLabel: sense.senseLabel,
      expandedForm: sense.expandedForm,
      needsLabel: sense.needsLabel,
      disambiguationNote: sense.disambiguationNote,
      definitionMd: sense.definitionMd,
      definitionText: sense.definitionText,
    },
    attestations: sense.definitions,
  };
}

/**
 * Streaming-friendly page of the full published dataset, senses and citations
 * included. Backs the bulk export endpoints.
 */
export async function listPublishedEntriesForExport(
  db: DbClientLike,
  input: { page: number; pageSize: number; entryType?: EntryType },
): Promise<{ items: PublicApiEntry[]; total: number }> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(500, Math.max(1, Math.floor(input.pageSize)));

  const where: Prisma.EntryWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
  };
  if (input.entryType) where.entryType = input.entryType;

  const [rows, total] = await Promise.all([
    db.entry.findMany({
      where,
      select: publishedEntrySelect,
      orderBy: [{ normalizedTitle: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.entry.count({ where }),
  ]);

  return { total, items: rows.map(shapeEntry) };
}
