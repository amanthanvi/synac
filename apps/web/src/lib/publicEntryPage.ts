import { notFound, permanentRedirect } from 'next/navigation';

import {
  getPrismaClient,
  listPublishedRelationshipsForEntry,
  resolvePublishedEntryBySlug,
} from '@synac/db';

import { markdownToText } from './text';

type PublicEntryType = 'TERM' | 'ACRONYM';

export type PublicEntryExample = {
  id: string;
  exampleMd: string | null;
  exampleText: string | null;
};

export type PublicEntryTagLink = {
  tag: {
    id: string;
    name: string;
    slug: string;
  };
};

export type PublicEntrySense = {
  id: string;
  senseOrder: number;
  senseLabel: string | null;
  expandedForm: string | null;
  definitionMd: string | null;
  definitionText: string | null;
  examples: PublicEntryExample[];
};

export type PublicEntryRecord = {
  id: string;
  displayTitle: string;
  summaryMd: string | null;
  summaryText: string | null;
  updatedAt: Date;
  entryTags: PublicEntryTagLink[];
  variants: Array<{ variantText: string }>;
  senses: PublicEntrySense[];
};

export type PublicSenseCitation = {
  id: string;
  sourceId: string;
  url: string;
  source: { name: string };
  sourceDocument: { title: string | null };
  licenseNote: string | null;
  attributionText: string | null;
  accessedAt: Date;
};

export type PublicSenseProvenance = {
  entityId: string;
  contentMode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
  citation: PublicSenseCitation;
};

export type PublicEntryRelation = Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>[number];

function normalizeRefUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreByDefinition(expansion: string, definition: string): number {
  const tokens = expansion
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

  if (!tokens.length) return 0;

  const haystack = definition.toLowerCase();
  let score = 0;
  for (const token of new Set(tokens)) {
    if (new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(haystack)) {
      score += 1;
    }
  }

  return score;
}

export function formatEntryDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export type PublicEntryPageData = Awaited<ReturnType<typeof loadPublicEntryPageData>>;

export async function loadPublicEntryPageData(input: {
  slug: string;
  requestedType: PublicEntryType;
}): Promise<{
  entry: NonNullable<PublicEntryRecord>;
  related: Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>;
  seeAlso: Awaited<ReturnType<typeof listPublishedRelationshipsForEntry>>;
  otherSummaryById: Map<string, string | null>;
  provenanceBySenseId: Map<string, PublicSenseProvenance[]>;
  tocItems: Array<{ id: string; label: string }>;
  standsForPrimary: { primary: string | null; alternates: string[] };
  alsoKnownAs: string[];
}> {
  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, {
    entryType: input.requestedType,
    slug: input.slug,
  });

  if (!resolved) {
    const fallbackType = input.requestedType === 'TERM' ? 'ACRONYM' : 'TERM';
    const fallback = await resolvePublishedEntryBySlug(prisma, {
      entryType: fallbackType,
      slug: input.slug,
    });

    if (fallback) {
      permanentRedirect(
        fallbackType === 'TERM'
          ? `/term/${fallback.canonicalSlug}`
          : `/acronym/${fallback.canonicalSlug}`,
      );
    }

    notFound();
  }

  if (resolved.entry.entryType !== input.requestedType) {
    permanentRedirect(
      resolved.entry.entryType === 'TERM'
        ? `/term/${resolved.canonicalSlug}`
        : `/acronym/${resolved.canonicalSlug}`,
    );
  }

  if (resolved.needsRedirect) {
    permanentRedirect(
      input.requestedType === 'TERM'
        ? `/term/${resolved.canonicalSlug}`
        : `/acronym/${resolved.canonicalSlug}`,
    );
  }

  const entry = await prisma.entry.findFirst({
    where: { id: resolved.entry.id, status: 'PUBLISHED', deletedAt: null },
    include: {
      variants: { orderBy: [{ variantType: 'asc' }, { variantText: 'asc' }] },
      senses: {
        where: { status: 'PUBLISHED', deletedAt: null },
        orderBy: [{ senseOrder: 'asc' }],
        include: { examples: { orderBy: [{ exampleOrder: 'asc' }] } },
      },
      entryTags: {
        where: { tag: { deletedAt: null } },
        include: { tag: true },
      },
    },
  });

  if (!entry) {
    notFound();
  }

  const senseIds = entry.senses.map((sense) => sense.id);
  const provenance = senseIds.length
    ? await prisma.fieldProvenance.findMany({
        where: { entityType: 'SENSE', entityId: { in: senseIds } },
        include: { citation: { include: { source: true, sourceDocument: true } } },
        orderBy: [{ extractedAt: 'desc' }],
      })
    : [];

  const provenanceBySenseId = new Map<string, Array<(typeof provenance)[number]>>();
  for (const item of provenance) {
    if (item.entityType !== 'SENSE') continue;
    const list = provenanceBySenseId.get(item.entityId) ?? [];
    list.push(item);
    provenanceBySenseId.set(item.entityId, list);
  }

  const relationships = await listPublishedRelationshipsForEntry(prisma, {
    entryId: entry.id,
    limit: 50,
  });
  const related = relationships.filter((relationship) => relationship.relationshipType === 'RELATED').slice(0, 10);
  const seeAlso = relationships
    .filter((relationship) => relationship.relationshipType === 'SEE_ALSO')
    .slice(0, 10);

  const relatedEntryIds = Array.from(
    new Set([...related, ...seeAlso].map((relationship) => relationship.otherEntry.id)),
  );
  const relatedSummaries = relatedEntryIds.length
    ? await prisma.entry.findMany({
        where: { id: { in: relatedEntryIds }, status: 'PUBLISHED', deletedAt: null },
        select: { id: true, summaryText: true, summaryMd: true },
      })
    : [];

  const otherSummaryById = new Map<string, string | null>();
  for (const other of relatedSummaries) {
    otherSummaryById.set(
      other.id,
      other.summaryText ?? (other.summaryMd ? markdownToText(other.summaryMd) : null),
    );
  }

  const tocItems = entry.senses.map((sense) => ({
    id: sense.id,
    label: sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`,
  }));

  if (input.requestedType === 'ACRONYM') {
    const variants = (() => {
      const seen = new Set<string>();
      const values: string[] = [];
      for (const variant of entry.variants) {
        const text = variant.variantText.trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(text);
      }
      return values;
    })();

    const expandedForms = (() => {
      const raw = [
        ...entry.senses
          .map((sense) => sense.expandedForm)
          .filter((value): value is string => Boolean(value?.trim())),
        ...variants.filter((value) => value.includes(' ')),
      ];

      const seen = new Set<string>();
      const values: string[] = [];
      for (const value of raw) {
        const text = value.trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(text);
      }
      return values;
    })();

    const standsForPrimary = (() => {
      if (expandedForms.length === 0) {
        return { primary: null, alternates: [] as string[] };
      }

      if (expandedForms.length === 1) {
        return { primary: expandedForms[0]!, alternates: [] as string[] };
      }

      const definition = (entry.summaryText ?? entry.summaryMd ?? '').trim();
      if (!definition) {
        return { primary: expandedForms[0]!, alternates: expandedForms.slice(1) };
      }

      const scored = expandedForms
        .map((value) => ({ text: value, score: scoreByDefinition(value, definition) }))
        .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text));

      const primary = scored[0]!.text;
      return {
        primary,
        alternates: expandedForms.filter((value) => value.toLowerCase() !== primary.toLowerCase()),
      };
    })();

    const alsoKnownAs = variants.filter(
      (variant) => !expandedForms.some((expanded) => expanded.toLowerCase() === variant.toLowerCase()),
    );

    return {
      entry,
      related,
      seeAlso,
      otherSummaryById,
      provenanceBySenseId,
      tocItems,
      standsForPrimary,
      alsoKnownAs,
    };
  }

  const variants = (() => {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const variant of entry.variants) {
      const text = variant.variantText.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(text);
    }
    return values;
  })();

  const titleIsShortform = (() => {
    const value = entry.displayTitle.trim();
    if (!value || value.includes(' ')) return false;
    if (value.length < 2 || value.length > 12) return false;
    const letters = value.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2) return false;
    const uppercase = letters.replace(/[^A-Z]/g, '').length;
    return uppercase >= 2;
  })();

  const standsFor = variants.filter((variant) => variant.includes(' '));
  const alsoKnownAs =
    titleIsShortform && standsFor.length
      ? variants.filter((variant) => !variant.includes(' '))
      : variants;

  const standsForPrimary = (() => {
    if (!titleIsShortform || standsFor.length === 0) {
      return { primary: null, alternates: [] as string[] };
    }

    const definition = (entry.summaryText ?? entry.summaryMd ?? '').trim();
    if (!definition) {
      return { primary: standsFor[0]!, alternates: standsFor.slice(1) };
    }

    const scored = standsFor
      .map((variant) => ({ text: variant, score: scoreByDefinition(variant, definition) }))
      .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text));

    const primary = scored[0]!.text;
    return {
      primary,
      alternates: standsFor.filter((variant) => variant.toLowerCase() !== primary.toLowerCase()),
    };
  })();

  return {
    entry,
    related,
    seeAlso,
    otherSummaryById,
    provenanceBySenseId,
    tocItems,
    standsForPrimary,
    alsoKnownAs,
  };
}

export function buildSenseCitations(
  provenanceItems: PublicSenseProvenance[],
): Array<{
  citation: PublicSenseProvenance['citation'];
  contentMode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
}> {
  const rank = (mode: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED') => {
    if (mode === 'QUOTED') return 3;
    if (mode === 'PARAPHRASED') return 2;
    return 1;
  };

  const byKey = new Map<
    string,
    {
      citation: (typeof provenanceItems)[number]['citation'];
      contentMode: (typeof provenanceItems)[number]['contentMode'];
    }
  >();

  for (const provenance of provenanceItems) {
    const key = `${provenance.citation.sourceId}:${normalizeRefUrl(provenance.citation.url)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        citation: provenance.citation,
        contentMode: provenance.contentMode,
      });
      continue;
    }

    if (rank(provenance.contentMode) > rank(existing.contentMode)) {
      existing.contentMode = provenance.contentMode;
    }
  }

  return Array.from(byKey.values());
}

