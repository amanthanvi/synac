import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

type TagDefinition = {
  name: string;
  slug: string;
  description: string;
  patterns: RegExp[];
};

const TAGS: TagDefinition[] = [
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
    patterns: [
      /\bendpoint\b/i,
      /\bhost\b/i,
      /\bantivirus\b/i,
      /\bedr\b/i,
    ],
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

async function ensureTag(
  prisma: PrismaClient,
  input: { name: string; slug: string; description: string },
): Promise<{ tagId: string }> {
  const slug = slugify(input.slug);
  const name = normalizeWhitespace(input.name);
  const description = input.description.trim() ? input.description.trim() : null;

  const existing = await prisma.tag.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.tag.update({
      where: { id: existing.id },
      data: { name, slug, description },
      select: { id: true },
    });
    return { tagId: existing.id };
  }

  const created = await prisma.tag.create({
    data: { name, slug, description },
    select: { id: true },
  });

  return { tagId: created.id };
}

function tagsForDocument(doc: string, tagIds: Map<string, string>): string[] {
  const ids: string[] = [];
  for (const tag of TAGS) {
    if (tag.patterns.some((p) => p.test(doc))) {
      const id = tagIds.get(slugify(tag.slug));
      if (id) ids.push(id);
    }
  }
  return ids;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const tagIds = new Map<string, string>();
  for (const tag of TAGS) {
    const { tagId } = await ensureTag(prisma, {
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
    });
    tagIds.set(slugify(tag.slug), tagId);
  }

  const batchSize = 500;
  let cursor: { entryId: string } | undefined;

  let scanned = 0;
  let created = 0;

  for (;;) {
    const batch = await prisma.entrySearch.findMany({
      select: { entryId: true, searchDocument: true },
      orderBy: [{ entryId: 'asc' }],
      take: batchSize,
      ...(cursor ? { skip: 1, cursor } : {}),
    });

    if (batch.length === 0) break;
    cursor = { entryId: batch[batch.length - 1]!.entryId };

    const rows: Array<{ entryId: string; tagId: string }> = [];
    for (const row of batch) {
      scanned += 1;
      const doc = row.searchDocument ?? '';
      if (!doc) continue;

      const ids = tagsForDocument(doc, tagIds);
      for (const tagId of ids) {
        rows.push({ entryId: row.entryId, tagId });
      }
    }

    if (rows.length) {
      const res = await prisma.entryTag.createMany({ data: rows, skipDuplicates: true });
      created += res.count;
    }
  }

  console.log(JSON.stringify({ ok: true, scanned, created }, null, 2));
  await prisma.$disconnect();
}

await main();

