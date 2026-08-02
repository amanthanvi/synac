import { z } from 'zod';

export const ENTRY_TYPES = ['TERM', 'ACRONYM'] as const;
export const RELATIONSHIP_TYPES = ['RELATED', 'SEE_ALSO', 'CONTRAST'] as const;
export const TRUST_TIERS = ['TIER1', 'TIER2', 'TIER3'] as const;
export const LICENSE_TYPES = [
  'PUBLIC_DOMAIN',
  'US_GOV_PD',
  'CC_BY_4_0',
  'CC_BY_SA_4_0',
  'APACHE_2_0',
  'MIT',
  'OTHER',
] as const;
export const ADAPTERS = [
  'nistGlossary',
  'niccsGlossary',
  'rfc4949Glossary',
  'owaspVulnerabilities',
  'mitreAttackCti',
] as const;

const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'must be a valid calendar date');
const isoDateTime = z.iso.datetime({ offset: true });

const entryTypeSchema = z.enum(ENTRY_TYPES);
const relationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);

export const sourceFileSchema = z
  .object({
    slug,
    name: z.string().min(1),
    baseUrl: z.url(),
    license: z
      .object({
        type: z.enum(LICENSE_TYPES),
        url: z.url().optional(),
        notes: z.string().optional(),
        allowedUse: z.string().min(1),
        attributionRequirements: z.string().min(1),
      })
      .strict(),
    accessMethod: z.enum(['HTML', 'JSON', 'TEXT', 'CSV']),
    trustTier: z.enum(TRUST_TIERS),
    enabled: z.boolean(),
    ingest: z
      .object({
        adapter: z.enum(ADAPTERS),
        schedule: z.enum(['weekly', 'monthly']).default('weekly'),
        maxItems: z.number().int().min(1).max(10000).optional(),
      })
      .strict()
      .optional(),
    contact: z.string().optional(),
    lastVerifiedAt: isoDate,
  })
  .strict();

export const tagsFileSchema = z
  .object({
    tags: z.array(
      z
        .object({
          slug,
          name: z.string().min(1),
          description: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const redirectsFileSchema = z
  .object({
    redirects: z.array(
      z
        .object({
          entryType: entryTypeSchema,
          fromSlug: slug,
          toSlug: slug,
        })
        .strict(),
    ),
  })
  .strict();

const relationshipSchema = z
  .object({
    toType: entryTypeSchema,
    toSlug: slug,
    type: relationshipTypeSchema,
  })
  .strict();

const bundleSenseSchema = z
  .object({
    key: z.string().min(1).max(200),
    label: z.string().min(1).optional(),
    definitionMd: z.string().min(1),
    expandedForm: z.string().min(1).optional(),
    examples: z.array(z.string().min(1)).max(20).default([]),
    citation: z
      .object({
        documentKey: z.string().min(1),
        citationText: z.string().optional(),
        locator: z.string().optional(),
      })
      .strict(),
  })
  .strict();

const bundleEntrySchema = z
  .object({
    entryType: entryTypeSchema,
    slug,
    title: z.string().min(1),
    aliases: z.array(z.string().min(1)).max(50).default([]),
    tags: z.array(slug).max(30).default([]),
    summaryMd: z.string().min(1).optional(),
    updatedAt: isoDate,
    senses: z.array(bundleSenseSchema).min(1).max(50),
    relationships: z.array(relationshipSchema).max(100).default([]),
  })
  .strict();

export const bundleFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: slug,
    generatedAt: isoDateTime,
    adapterVersion: z.string().min(1),
    documents: z.array(
      z
        .object({
          key: z.string().min(1),
          url: z.url(),
          title: z.string().optional(),
          contentType: z.string().min(1),
          contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
          fetchedAt: isoDateTime,
        })
        .strict(),
    ),
    entries: z.array(bundleEntrySchema),
  })
  .strict();

const editorialSenseSchema = z
  .object({
    label: z.string().min(1).optional(),
    definitionMd: z.string().min(1),
    expandedForm: z.string().min(1).optional(),
    rationale: z.string().min(1),
    examples: z.array(z.string().min(1)).max(20).default([]),
  })
  .strict();

export const overrideFileSchema = z
  .object({
    /** Required (with updatedAt) for editorial-only entries that exist in no bundle. */
    title: z.string().min(1).optional(),
    updatedAt: isoDate.optional(),
    suppress: z
      .object({
        reason: z.string().min(1),
        reference: z.url().optional(),
      })
      .strict()
      .optional(),
    summaryMd: z.string().min(1).optional(),
    editorialNotes: z.string().min(1).optional(),
    addAliases: z.array(z.string().min(1)).max(50).default([]),
    addTags: z.array(slug).max(30).default([]),
    removeTags: z.array(slug).max(30).default([]),
    addRelationships: z.array(relationshipSchema).max(100).default([]),
    /** Sense keys are namespaced: "<sourceSlug>:<senseKey>". */
    suppressSenses: z.array(z.string().min(1)).max(50).default([]),
    preferredSense: z.string().min(1).optional(),
    editorialSenses: z.array(editorialSenseSchema).max(20).default([]),
  })
  .strict();

export type SourceFile = z.infer<typeof sourceFileSchema>;
export type TagsFile = z.infer<typeof tagsFileSchema>;
export type RedirectsFile = z.infer<typeof redirectsFileSchema>;
export type BundleFile = z.infer<typeof bundleFileSchema>;
export type BundleEntry = z.infer<typeof bundleEntrySchema>;
export type OverrideFile = z.infer<typeof overrideFileSchema>;
export type EntryType = (typeof ENTRY_TYPES)[number];
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export type CompiledCitation = {
  sourceSlug: string;
  sourceName: string;
  url: string;
  documentTitle: string | undefined;
  citationText: string | undefined;
  licenseNote: string | undefined;
  attributionText: string;
  accessedAt: number;
  locator: string | undefined;
};

export type CompiledSense = {
  entryKey: string;
  key: string;
  order: number;
  label: string | undefined;
  definitionMd: string;
  definitionText: string;
  expandedForm: string | undefined;
  isEditorial: boolean;
  editorialRationale: string | undefined;
  isPreferred: boolean;
  examples: Array<{ md: string; text: string }>;
  citations: CompiledCitation[];
};

export type CompiledEntry = {
  key: string;
  entryType: EntryType;
  slug: string;
  title: string;
  normalizedTitle: string;
  aliases: string[];
  summaryMd: string | undefined;
  summaryText: string | undefined;
  editorialNotes: string | undefined;
  updatedAt: number;
  senseCount: number;
  senseSummary: string | undefined;
  searchDocument: string;
  tagSlugs: string[];
  citedSourceSlugs: string[];
};

export type CompiledSource = {
  slug: string;
  name: string;
  baseUrl: string;
  licenseType: (typeof LICENSE_TYPES)[number];
  licenseUrl: string | undefined;
  licenseNotes: string | undefined;
  allowedUse: string;
  attributionRequirements: string;
  trustTier: (typeof TRUST_TIERS)[number];
  enabled: boolean;
  lastVerifiedAt: number;
  citedEntryCount: number;
};

export type CompiledDataset = {
  contentVersion: string;
  sources: CompiledSource[];
  tags: Array<{ slug: string; name: string; description: string | undefined; entryCount: number }>;
  entries: CompiledEntry[];
  senses: CompiledSense[];
  relationships: Array<{ fromKey: string; toKey: string; type: RelationshipType }>;
  redirects: Array<{ entryType: EntryType; fromSlug: string; toSlug: string }>;
};
