import { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';

function isUniqueConstraintViolation(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/**
 * A single evidence signal for a tag.
 *
 * `weight: 1` marks a generic term that only counts as corroboration; `weight: 2`
 * marks a multi-word phrase or domain-specific acronym that is decisive on its own.
 */
export type AutoTagPattern = {
  pattern: RegExp;
  weight: 1 | 2;
};

export type AutoTagDefinition = {
  name: string;
  slug: string;
  description: string;
  patterns: AutoTagPattern[];
};

/**
 * Minimum summed pattern weight before a tag is auto-applied: two independent
 * generic hits, or one specific phrase/acronym. Single common English words are
 * deliberately absent from the catalog: they produced near-universal tags.
 */
export const AUTO_TAG_THRESHOLD = 2;

export const AUTO_TAG_DEFINITIONS: AutoTagDefinition[] = [
  {
    name: 'Identity',
    slug: 'identity',
    description:
      'Authentication, authorization, federation, and identity systems.',
    patterns: [
      { pattern: /\bauthentication\b/i, weight: 1 },
      { pattern: /\bauthorization\b/i, weight: 1 },
      { pattern: /\bfederation\b/i, weight: 1 },
      { pattern: /\bcredential/i, weight: 1 },
      { pattern: /\bidentity\b/i, weight: 1 },
      { pattern: /\bsingle sign-?on\b/i, weight: 2 },
      { pattern: /\bsso\b/i, weight: 2 },
      { pattern: /\bmfa\b/i, weight: 2 },
      { pattern: /\bmulti-?factor\b/i, weight: 2 },
      { pattern: /\boauth\b/i, weight: 2 },
      { pattern: /\boidc\b/i, weight: 2 },
      { pattern: /\bopenid connect\b/i, weight: 2 },
      { pattern: /\bsaml\b/i, weight: 2 },
      { pattern: /\bidentity provider\b/i, weight: 2 },
      { pattern: /\baccess token\b/i, weight: 2 },
      { pattern: /\bbearer token\b/i, weight: 2 },
    ],
  },
  {
    name: 'Access Control',
    slug: 'access-control',
    description: 'Authorization models, least privilege, and enforcement.',
    patterns: [
      { pattern: /\bauthorization\b/i, weight: 1 },
      { pattern: /\bpermission/i, weight: 1 },
      { pattern: /\bprivilege/i, weight: 1 },
      { pattern: /\baccess control\b/i, weight: 2 },
      { pattern: /\bleast privilege\b/i, weight: 2 },
      { pattern: /\brole-?based access\b/i, weight: 2 },
      { pattern: /\battribute-?based access\b/i, weight: 2 },
      { pattern: /\brbac\b/i, weight: 2 },
      { pattern: /\babac\b/i, weight: 2 },
    ],
  },
  {
    name: 'Cryptography',
    slug: 'cryptography',
    description:
      'Encryption, keys, cryptographic primitives, and certificates.',
    patterns: [
      { pattern: /\bencrypt/i, weight: 1 },
      { pattern: /\bdecrypt/i, weight: 1 },
      { pattern: /\bcipher\b/i, weight: 1 },
      { pattern: /\bcertificate\b/i, weight: 1 },
      { pattern: /\bnonce\b/i, weight: 1 },
      { pattern: /\bhash\b/i, weight: 1 },
      { pattern: /\bcryptograph/i, weight: 2 },
      { pattern: /\bhmac\b/i, weight: 2 },
      { pattern: /\bpublic key\b/i, weight: 2 },
      { pattern: /\bprivate key\b/i, weight: 2 },
      { pattern: /\bsymmetric key\b/i, weight: 2 },
      { pattern: /\bdigital signature\b/i, weight: 2 },
      { pattern: /\bx\.?509\b/i, weight: 2 },
      { pattern: /\bpki\b/i, weight: 2 },
      { pattern: /\btls\b/i, weight: 2 },
      { pattern: /\bssl\b/i, weight: 2 },
    ],
  },
  {
    name: 'Network Security',
    slug: 'network-security',
    description:
      'Network protocols, resilience, and denial-of-service defenses.',
    patterns: [
      { pattern: /\bnetwork\b/i, weight: 1 },
      { pattern: /\bproxy\b/i, weight: 1 },
      { pattern: /\bpacket\b/i, weight: 1 },
      { pattern: /\brouting\b/i, weight: 1 },
      { pattern: /\bfirewall\b/i, weight: 2 },
      { pattern: /\bddos\b/i, weight: 2 },
      { pattern: /\bdenial of service\b/i, weight: 2 },
      { pattern: /\bipsec\b/i, weight: 2 },
      { pattern: /\bvpn\b/i, weight: 2 },
      { pattern: /\btcp\b/i, weight: 2 },
      { pattern: /\budp\b/i, weight: 2 },
      { pattern: /\bdns\b/i, weight: 2 },
    ],
  },
  {
    name: 'Application Security',
    slug: 'application-security',
    description: 'Web/app vulnerabilities and secure coding concepts.',
    patterns: [
      { pattern: /\bvulnerabilit/i, weight: 1 },
      { pattern: /\bexploit/i, weight: 1 },
      { pattern: /\binjection\b/i, weight: 1 },
      { pattern: /\bsql injection\b/i, weight: 2 },
      { pattern: /\bcross-?site scripting\b/i, weight: 2 },
      { pattern: /\bcross-?site request forgery\b/i, weight: 2 },
      { pattern: /\bserver-?side request forgery\b/i, weight: 2 },
      { pattern: /\bremote code execution\b/i, weight: 2 },
      { pattern: /\bpath traversal\b/i, weight: 2 },
      { pattern: /\bcontent security policy\b/i, weight: 2 },
      { pattern: /\bsecure coding\b/i, weight: 2 },
      { pattern: /\bxss\b/i, weight: 2 },
      { pattern: /\bcsrf\b/i, weight: 2 },
      { pattern: /\bssrf\b/i, weight: 2 },
      { pattern: /\bsqli\b/i, weight: 2 },
      { pattern: /\brce\b/i, weight: 2 },
      { pattern: /\bwaf\b/i, weight: 2 },
    ],
  },
  {
    name: 'Threats',
    slug: 'threats',
    description: 'Malware, phishing, and common attack patterns.',
    patterns: [
      { pattern: /\bthreat\b/i, weight: 1 },
      { pattern: /\battack/i, weight: 1 },
      { pattern: /\badversar/i, weight: 1 },
      { pattern: /\bmalware\b/i, weight: 2 },
      { pattern: /\bphishing\b/i, weight: 2 },
      { pattern: /\bransomware\b/i, weight: 2 },
      { pattern: /\bbotnet\b/i, weight: 2 },
      { pattern: /\bthreat actor\b/i, weight: 2 },
      { pattern: /\badvanced persistent threat\b/i, weight: 2 },
    ],
  },
  {
    name: 'Security Operations',
    slug: 'security-operations',
    description: 'Monitoring, detection, and operational security workflows.',
    patterns: [
      { pattern: /\btelemetry\b/i, weight: 1 },
      { pattern: /\bdetection\b/i, weight: 1 },
      { pattern: /\balert\b/i, weight: 1 },
      { pattern: /\bsecurity operations\b/i, weight: 2 },
      { pattern: /\bsecurity monitoring\b/i, weight: 2 },
      { pattern: /\bthreat hunting\b/i, weight: 2 },
      { pattern: /\bsoc\b/i, weight: 2 },
      { pattern: /\bsiem\b/i, weight: 2 },
      { pattern: /\bsoar\b/i, weight: 2 },
      { pattern: /\bedr\b/i, weight: 2 },
      { pattern: /\bxdr\b/i, weight: 2 },
    ],
  },
  {
    name: 'Incident Response',
    slug: 'incident-response',
    description: 'Triage, containment, recovery, and forensics.',
    patterns: [
      { pattern: /\bcontainment\b/i, weight: 1 },
      { pattern: /\beradication\b/i, weight: 1 },
      { pattern: /\bforensic/i, weight: 1 },
      { pattern: /\btriage\b/i, weight: 1 },
      { pattern: /\bincident response\b/i, weight: 2 },
      { pattern: /\bincident handling\b/i, weight: 2 },
      { pattern: /\bdisaster recovery\b/i, weight: 2 },
    ],
  },
  {
    name: 'Vulnerability Management',
    slug: 'vulnerability-management',
    description: 'Discovery, scoring, remediation, and exposure tracking.',
    patterns: [
      { pattern: /\bremediation\b/i, weight: 1 },
      { pattern: /\bmitigation\b/i, weight: 1 },
      { pattern: /\bexposure\b/i, weight: 1 },
      { pattern: /\bvulnerability management\b/i, weight: 2 },
      { pattern: /\bvulnerability scann/i, weight: 2 },
      { pattern: /\bpatch management\b/i, weight: 2 },
      { pattern: /\bcve\b/i, weight: 2 },
      { pattern: /\bcvss\b/i, weight: 2 },
      { pattern: /\bkev\b/i, weight: 2 },
    ],
  },
  {
    name: 'Cloud & Containers',
    slug: 'cloud-containers',
    description: 'Cloud, container, and Kubernetes security concepts.',
    patterns: [
      { pattern: /\bcloud\b/i, weight: 1 },
      { pattern: /\bcontainer/i, weight: 1 },
      { pattern: /\borchestrat/i, weight: 1 },
      { pattern: /\bcloud security\b/i, weight: 2 },
      { pattern: /\bkubernetes\b/i, weight: 2 },
      { pattern: /\bk8s\b/i, weight: 2 },
      { pattern: /\bdocker\b/i, weight: 2 },
      { pattern: /\bserverless\b/i, weight: 2 },
      { pattern: /\bterraform\b/i, weight: 2 },
      { pattern: /\binfrastructure as code\b/i, weight: 2 },
    ],
  },
  {
    name: 'Endpoint Security',
    slug: 'endpoint-security',
    description: 'Host-based controls and endpoint protection.',
    patterns: [
      { pattern: /\bendpoint\b/i, weight: 1 },
      { pattern: /\bworkstation\b/i, weight: 1 },
      { pattern: /\bantivirus\b/i, weight: 2 },
      { pattern: /\bendpoint detection\b/i, weight: 2 },
      { pattern: /\bhost-?based\b/i, weight: 2 },
      { pattern: /\bedr\b/i, weight: 2 },
    ],
  },
  {
    name: 'Governance & Risk',
    slug: 'governance-risk',
    description: 'Governance, risk management, and compliance.',
    patterns: [
      { pattern: /\bgovernance\b/i, weight: 1 },
      { pattern: /\bcompliance\b/i, weight: 1 },
      { pattern: /\baudit\b/i, weight: 1 },
      { pattern: /\brisk management\b/i, weight: 2 },
      { pattern: /\brisk assessment\b/i, weight: 2 },
      { pattern: /\bsecurity policy\b/i, weight: 2 },
      { pattern: /\bsecurity control\b/i, weight: 2 },
      { pattern: /\bcontrol framework\b/i, weight: 2 },
    ],
  },
  {
    name: 'Software Supply Chain',
    slug: 'software-supply-chain',
    description: 'Dependencies, SBOMs, build provenance, and CI/CD security.',
    patterns: [
      { pattern: /\bdependenc/i, weight: 1 },
      { pattern: /\bprovenance\b/i, weight: 1 },
      { pattern: /\bartifact\b/i, weight: 1 },
      { pattern: /\bsupply chain\b/i, weight: 2 },
      { pattern: /\bsoftware bill of materials\b/i, weight: 2 },
      { pattern: /\bsbom\b/i, weight: 2 },
      { pattern: /\bci\/cd\b/i, weight: 2 },
      { pattern: /\bslsa\b/i, weight: 2 },
    ],
  },
  {
    name: 'Privacy',
    slug: 'privacy',
    description: 'Privacy concepts and personal data handling.',
    patterns: [
      { pattern: /\bprivacy\b/i, weight: 1 },
      { pattern: /\banonymi/i, weight: 1 },
      { pattern: /\bpseudonym/i, weight: 1 },
      { pattern: /\bpersonal data\b/i, weight: 2 },
      { pattern: /\bpersonally identifiable\b/i, weight: 2 },
      { pattern: /\bdata minimi[sz]ation\b/i, weight: 2 },
      { pattern: /\bpii\b/i, weight: 2 },
    ],
  },
  {
    name: 'Fundamentals',
    slug: 'fundamentals',
    description: 'Core security properties and building blocks.',
    patterns: [
      { pattern: /\bconfidentiality\b/i, weight: 1 },
      { pattern: /\bintegrity\b/i, weight: 1 },
      { pattern: /\bavailability\b/i, weight: 1 },
      { pattern: /\bcia triad\b/i, weight: 2 },
      { pattern: /\bnon-?repudiation\b/i, weight: 2 },
    ],
  },
];

const AUTO_TAG_SLUGS = AUTO_TAG_DEFINITIONS.map(
  (definition) => definition.slug,
);

/**
 * Best-effort markdown stripping. `entry_search.search_document` is already
 * text-only, but callers may hand in raw markdown. Unlike `markdownToText` this
 * keeps hyphens, which the patterns below match on (`cross-?site`, `k8s`).
 */
function toPlainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type AutoTagMatch = {
  slug: string;
  score: number;
};

/** Summed pattern weights per tag, for tags that clear {@link AUTO_TAG_THRESHOLD}. */
export function collectAutoTagMatchesForDocument(
  document: string,
): AutoTagMatch[] {
  const text = toPlainText(document);
  if (!text) return [];

  const matches: AutoTagMatch[] = [];

  for (const definition of AUTO_TAG_DEFINITIONS) {
    let score = 0;
    for (const { pattern, weight } of definition.patterns) {
      if (pattern.test(text)) score += weight;
    }
    if (score >= AUTO_TAG_THRESHOLD) {
      matches.push({ slug: definition.slug, score });
    }
  }

  return matches;
}

export function collectAutoTagSlugsForDocument(document: string): string[] {
  return collectAutoTagMatchesForDocument(document).map((match) => match.slug);
}

/**
 * Reconciles the AUTO tag links for one entry against its search document.
 *
 * Only `assignedBy: 'AUTO'` links are ever created or removed. EDITORIAL and
 * INGEST links are curator/importer decisions and are left alone. Tag rows are
 * never created unless `ensureDefinitions: true` is passed explicitly, so a
 * routine republish cannot silently expand the tag vocabulary.
 */
export async function syncAutoTagsForPublishedEntry(
  db: DbClientLike,
  input: { entryId: string; ensureDefinitions?: boolean },
): Promise<{ added: number; removed: number; matchedSlugs: string[] }> {
  const search = await db.entrySearch.findFirst({
    where: { entryId: input.entryId },
    select: { entryId: true, searchDocument: true },
  });

  const matchedSlugs = search?.searchDocument?.trim()
    ? collectAutoTagSlugsForDocument(search.searchDocument)
    : [];

  if (input.ensureDefinitions === true && matchedSlugs.length > 0) {
    await ensureMissingAutoTagDefinitions(db, { slugs: matchedSlugs });
  }

  const tags = await db.tag.findMany({
    where: { slug: { in: AUTO_TAG_SLUGS }, deletedAt: null },
    select: { id: true, slug: true },
  });
  const matchedSlugSet = new Set(matchedSlugs);
  const matchedTags = tags.filter((tag) => matchedSlugSet.has(tag.slug));
  const matchedTagIds = new Set(matchedTags.map((tag) => tag.id));

  const existingLinks = await db.entryTag.findMany({
    where: {
      entryId: input.entryId,
      tag: { slug: { in: AUTO_TAG_SLUGS } },
    },
    select: { tagId: true, assignedBy: true },
  });

  const autoTagIds = new Set<string>();
  const curatedTagIds = new Set<string>();
  for (const row of existingLinks) {
    if (row.assignedBy === 'AUTO') autoTagIds.add(row.tagId);
    else curatedTagIds.add(row.tagId);
  }

  const staleTagIds = Array.from(autoTagIds).filter(
    (tagId) => !matchedTagIds.has(tagId),
  );

  let removed = 0;
  if (staleTagIds.length > 0) {
    const result = await db.entryTag.deleteMany({
      where: {
        entryId: input.entryId,
        tagId: { in: staleTagIds },
        assignedBy: 'AUTO',
      },
    });
    removed = result.count;
  }

  const nextLinks = matchedTags.flatMap((tag) =>
    autoTagIds.has(tag.id) || curatedTagIds.has(tag.id)
      ? []
      : [
          {
            entryId: input.entryId,
            tagId: tag.id,
            assignedBy: 'AUTO' as const,
          },
        ],
  );

  if (nextLinks.length > 0) {
    await db.entryTag.createMany({ data: nextLinks, skipDuplicates: true });
  }

  return {
    added: nextLinks.length,
    removed,
    matchedSlugs: matchedTags.map((tag) => tag.slug),
  };
}

export async function ensureMissingAutoTagDefinitions(
  db: DbClientLike,
  input: { slugs: string[] },
): Promise<Array<{ id: string; slug: string }>> {
  const requestedSlugs = new Set(
    input.slugs.map((slug) => slug.trim()).filter(Boolean),
  );
  if (requestedSlugs.size === 0) return [];

  const definitions = AUTO_TAG_DEFINITIONS.filter((definition) =>
    requestedSlugs.has(definition.slug),
  );
  if (definitions.length === 0) return [];

  const slugList = definitions.map((definition) => definition.slug);
  const [existingRows, historyRows] = await Promise.all([
    db.tag.findMany({
      where: { slug: { in: slugList } },
      select: { id: true, slug: true, deletedAt: true },
    }),
    db.tagSlugHistory.findMany({
      where: { slug: { in: slugList } },
      select: { slug: true },
    }),
  ]);
  const bySlug = new Map(existingRows.map((row) => [row.slug, row]));
  const reservedSlugs = new Set(historyRows.map((row) => row.slug));

  const results: Array<{ id: string; slug: string }> = [];
  const createPayload: Array<{
    name: string;
    slug: string;
    description: string;
  }> = [];

  for (const definition of definitions) {
    if (reservedSlugs.has(definition.slug)) {
      const existing = bySlug.get(definition.slug);
      if (existing?.deletedAt === null) {
        results.push({ id: existing.id, slug: existing.slug });
      }
      continue;
    }

    const existing = bySlug.get(definition.slug);

    if (existing) {
      if (existing.deletedAt === null) {
        results.push({ id: existing.id, slug: existing.slug });
      }
      continue;
    }

    createPayload.push({
      name: definition.name,
      slug: definition.slug,
      description: definition.description,
    });
  }

  if (createPayload.length > 0) {
    const createdBySlug = new Map<string, { id: string; slug: string }>();
    for (const data of createPayload) {
      try {
        const row = await db.tag.create({
          data,
          select: { id: true, slug: true },
        });
        createdBySlug.set(data.slug, row);
      } catch (err) {
        if (!isUniqueConstraintViolation(err)) throw err;
        const row = await db.tag.findFirst({
          where: { slug: data.slug, deletedAt: null },
          select: { id: true, slug: true },
        });
        if (row) createdBySlug.set(data.slug, row);
      }
    }
    const createSlugSet = new Set(createPayload.map((row) => row.slug));
    for (const definition of definitions) {
      if (!createSlugSet.has(definition.slug)) continue;
      const row = createdBySlug.get(definition.slug);
      if (row) results.push(row);
    }
  }

  return results;
}
