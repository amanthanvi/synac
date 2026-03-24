import type { DbClientLike } from '../client.js';

export type AutoTagDefinition = {
  name: string;
  slug: string;
  description: string;
  patterns: RegExp[];
};

export const AUTO_TAG_DEFINITIONS: AutoTagDefinition[] = [
  {
    name: 'Identity',
    slug: 'identity',
    description: 'Authentication, authorization, federation, and identity systems.',
    patterns: [
      /\bauthentication\b/i,
      /\bauthorization\b/i,
      /\bfederation\b/i,
      /\bsso\b/i,
      /\bmfa\b/i,
      /\boauth\b/i,
      /\boidc\b/i,
      /\bsaml\b/i,
      /\bidp\b/i,
      /\btoken\b/i,
      /\bsession\b/i,
      /\bcredential\b/i,
    ],
  },
  {
    name: 'Access Control',
    slug: 'access-control',
    description: 'Authorization models, least privilege, and enforcement.',
    patterns: [
      /\baccess control\b/i,
      /\bleast privilege\b/i,
      /\brbac\b/i,
      /\babac\b/i,
      /\bpermission\b/i,
      /\bpolicy\b/i,
      /\bauthorization\b/i,
    ],
  },
  {
    name: 'Cryptography',
    slug: 'cryptography',
    description: 'Encryption, keys, cryptographic primitives, and certificates.',
    patterns: [
      /\bcryptograph/i,
      /\bencrypt/i,
      /\bdecrypt/i,
      /\bcipher\b/i,
      /\bhash\b/i,
      /\bhmac\b/i,
      /\bsignature\b/i,
      /\bpublic key\b/i,
      /\bprivate key\b/i,
      /\bcertificate\b/i,
      /\bx\.?509\b/i,
      /\bpki\b/i,
      /\btls\b/i,
      /\bssl\b/i,
      /\bnonce\b/i,
    ],
  },
  {
    name: 'Network Security',
    slug: 'network-security',
    description: 'Network protocols, resilience, and denial-of-service defenses.',
    patterns: [
      /\bnetwork\b/i,
      /\btcp\b/i,
      /\budp\b/i,
      /\bdns\b/i,
      /\bfirewall\b/i,
      /\bproxy\b/i,
      /\bpacket\b/i,
      /\bddos\b/i,
      /\bdos\b/i,
      /\bipsec\b/i,
      /\bvpn\b/i,
    ],
  },
  {
    name: 'Application Security',
    slug: 'application-security',
    description: 'Web/app vulnerabilities and secure coding concepts.',
    patterns: [
      /\bvulnerability\b/i,
      /\bexploit\b/i,
      /\binjection\b/i,
      /\bxss\b/i,
      /\bcsrf\b/i,
      /\bssrf\b/i,
      /\bsql injection\b/i,
      /\bsqli\b/i,
      /\brce\b/i,
      /\bremote code execution\b/i,
      /\bpath traversal\b/i,
      /\bcsp\b/i,
      /\bwaf\b/i,
    ],
  },
  {
    name: 'Threats',
    slug: 'threats',
    description: 'Malware, phishing, and common attack patterns.',
    patterns: [
      /\bthreat\b/i,
      /\battack\b/i,
      /\badversary\b/i,
      /\bmalware\b/i,
      /\bphishing\b/i,
      /\bransomware\b/i,
      /\bbotnet\b/i,
      /\bapt\b/i,
    ],
  },
  {
    name: 'Security Operations',
    slug: 'security-operations',
    description: 'Monitoring, detection, and operational security workflows.',
    patterns: [
      /\bsoc\b/i,
      /\bsiem\b/i,
      /\bedr\b/i,
      /\bxdr\b/i,
      /\btelemetry\b/i,
      /\blog\b/i,
      /\balert\b/i,
      /\bmonitor/i,
      /\bdetection\b/i,
    ],
  },
  {
    name: 'Incident Response',
    slug: 'incident-response',
    description: 'Triage, containment, recovery, and forensics.',
    patterns: [
      /\bincident response\b/i,
      /\bcontainment\b/i,
      /\beradication\b/i,
      /\brecovery\b/i,
      /\bforensics\b/i,
      /\btriage\b/i,
    ],
  },
  {
    name: 'Vulnerability Management',
    slug: 'vulnerability-management',
    description: 'Discovery, scoring, remediation, and exposure tracking.',
    patterns: [
      /\bcve\b/i,
      /\bcvss\b/i,
      /\bpatch\b/i,
      /\bremediation\b/i,
      /\bmitigation\b/i,
      /\bscanner\b/i,
      /\bvulnerability management\b/i,
    ],
  },
  {
    name: 'Cloud & Containers',
    slug: 'cloud-containers',
    description: 'Cloud, container, and Kubernetes security concepts.',
    patterns: [
      /\bcloud\b/i,
      /\bcontainer\b/i,
      /\bdocker\b/i,
      /\bkubernetes\b/i,
      /\bk8s\b/i,
      /\bserverless\b/i,
      /\bterraform\b/i,
      /\baws\b/i,
      /\bazure\b/i,
      /\bgcp\b/i,
    ],
  },
  {
    name: 'Endpoint Security',
    slug: 'endpoint-security',
    description: 'Host-based controls and endpoint protection.',
    patterns: [/\bendpoint\b/i, /\bhost\b/i, /\bantivirus\b/i, /\bedr\b/i],
  },
  {
    name: 'Governance & Risk',
    slug: 'governance-risk',
    description: 'Governance, risk management, and compliance.',
    patterns: [
      /\bgovernance\b/i,
      /\brisk\b/i,
      /\bcompliance\b/i,
      /\baudit\b/i,
      /\bcontrol\b/i,
      /\bpolicy\b/i,
    ],
  },
  {
    name: 'Software Supply Chain',
    slug: 'software-supply-chain',
    description: 'Dependencies, SBOMs, build provenance, and CI/CD security.',
    patterns: [
      /\bsbom\b/i,
      /\bsupply chain\b/i,
      /\bdependency\b/i,
      /\bpackage\b/i,
      /\bci\/cd\b/i,
      /\bslsa\b/i,
      /\bprovenance\b/i,
    ],
  },
  {
    name: 'Privacy',
    slug: 'privacy',
    description: 'Privacy concepts and personal data handling.',
    patterns: [
      /\bprivacy\b/i,
      /\bpii\b/i,
      /\bpersonal data\b/i,
      /\banonym/i,
      /\bpseudonym/i,
    ],
  },
  {
    name: 'Fundamentals',
    slug: 'fundamentals',
    description: 'Core security properties and building blocks.',
    patterns: [
      /\bconfidentiality\b/i,
      /\bintegrity\b/i,
      /\bavailability\b/i,
      /\bcia\b/i,
    ],
  },
];

export function collectAutoTagSlugsForDocument(document: string): string[] {
  const normalizedDocument = document.trim();
  if (!normalizedDocument) return [];

  return AUTO_TAG_DEFINITIONS.filter((definition) =>
    definition.patterns.some((pattern) => pattern.test(normalizedDocument)),
  ).map((definition) => definition.slug);
}

export function shouldCreateAutoTagDefinition(
  existing: { deletedAt: Date | null } | null,
): boolean {
  return existing === null;
}

export async function ensureAutoTagDefinitions(
  db: DbClientLike,
): Promise<Array<{ id: string; slug: string }>> {
  const results: Array<{ id: string; slug: string }> = [];

  for (const definition of AUTO_TAG_DEFINITIONS) {
    const existing = await db.tag.findFirst({
      where: { slug: definition.slug, deletedAt: null },
      select: { id: true, slug: true },
    });

    const tag = existing
      ? await db.tag.update({
          where: { id: existing.id },
          data: {
            name: definition.name,
            description: definition.description,
          },
          select: { id: true, slug: true },
        })
      : await db.tag.create({
          data: {
            name: definition.name,
            slug: definition.slug,
            description: definition.description,
          },
          select: { id: true, slug: true },
        });

    results.push(tag);
  }

  return results;
}

export async function syncAutoTagsForPublishedEntry(
  db: DbClientLike,
  input: { entryId: string; ensureDefinitions?: boolean },
): Promise<{ added: number; matchedSlugs: string[] }> {
  const search = await db.entrySearch.findFirst({
    where: { entryId: input.entryId },
    select: { entryId: true, searchDocument: true },
  });

  if (!search?.searchDocument?.trim()) {
    return { added: 0, matchedSlugs: [] };
  }

  const matchedSlugs = collectAutoTagSlugsForDocument(search.searchDocument);
  if (matchedSlugs.length === 0) {
    return { added: 0, matchedSlugs: [] };
  }

  if (input.ensureDefinitions !== false) {
    await ensureAutoTagDefinitions(db);
  }

  const tags = await db.tag.findMany({
    where: { slug: { in: matchedSlugs }, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (tags.length === 0) {
    return { added: 0, matchedSlugs: [] };
  }

  const existing = await db.entryTag.findMany({
    where: { entryId: input.entryId, tagId: { in: tags.map((tag) => tag.id) } },
    select: { tagId: true },
  });
  const existingTagIds = new Set(existing.map((row) => row.tagId));
  const nextLinks = tags
    .filter((tag) => !existingTagIds.has(tag.id))
    .map((tag) => ({ entryId: input.entryId, tagId: tag.id }));

  if (nextLinks.length > 0) {
    await db.entryTag.createMany({ data: nextLinks, skipDuplicates: true });
  }

  return { added: nextLinks.length, matchedSlugs: tags.map((tag) => tag.slug) };
}

export async function ensureMissingAutoTagDefinitions(
  db: DbClientLike,
  input: { slugs: string[] },
): Promise<Array<{ id: string; slug: string }>> {
  const requestedSlugs = new Set(input.slugs.map((slug) => slug.trim()).filter(Boolean));
  if (requestedSlugs.size === 0) return [];

  const definitions = AUTO_TAG_DEFINITIONS.filter((definition) => requestedSlugs.has(definition.slug));
  const results: Array<{ id: string; slug: string }> = [];

  for (const definition of definitions) {
    const existing = await db.tag.findFirst({
      where: { slug: definition.slug },
      select: { id: true, slug: true, deletedAt: true },
    });

    if (!shouldCreateAutoTagDefinition(existing)) {
      if (existing?.deletedAt === null) {
        results.push({ id: existing.id, slug: existing.slug });
      }
      continue;
    }

    if (existing && existing.deletedAt === null) {
      results.push(existing);
      continue;
    }

    const created = await db.tag.create({
      data: {
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
      },
      select: { id: true, slug: true },
    });
    results.push(created);
  }

  return results;
}
