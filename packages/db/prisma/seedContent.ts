import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeTitle(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function markdownToText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function fetchForHash(url: string): Promise<{
  finalUrl: string;
  contentType: string;
  etag?: string;
  lastModified?: string;
  sha256: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'synac-seed/0.1.0 (+https://synac.app)',
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    return {
      finalUrl: res.url,
      contentType,
      etag: res.headers.get('etag') ?? undefined,
      lastModified: res.headers.get('last-modified') ?? undefined,
      sha256,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureSeedActor(prisma: PrismaClient): Promise<{ actorUserId: string }> {
  const adminEmails = parseCsv(process.env.SYNAC_ADMIN_EMAILS);
  const email = adminEmails[0]?.toLowerCase();
  if (!email) {
    throw new Error('SYNAC_ADMIN_EMAILS is required for db:seed:content (needs an actor for audit events)');
  }

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
    select: { id: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { status: 'ACTIVE' },
    create: { email, authProvider: 'OIDC', status: 'ACTIVE' },
    select: { id: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  return { actorUserId: user.id };
}

async function ensureTag(
  prisma: PrismaClient,
  input: { name: string; slug: string; description?: string },
): Promise<{ tagId: string }> {
  const slug = slugify(input.slug);
  const name = normalizeWhitespace(input.name);
  const description = input.description?.trim() ? input.description.trim() : null;

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

async function ensureSource(
  prisma: PrismaClient,
  input: {
    name: string;
    sourceSlug: string;
    baseUrl: string;
    cronSchedule?: string | null;
    licenseType: 'PUBLIC_DOMAIN' | 'CC_BY_SA_4_0' | 'OTHER';
    licenseNotes?: string;
    allowedUse: string;
    attributionRequirements: string;
    accessMethod: 'API' | 'HTML';
    robotsPolicy: 'RESPECT';
    trustTier: 'TIER_1' | 'TIER_2';
    enabled: boolean;
    lastVerifiedAt: Date;
    contact?: string;
  },
): Promise<{ sourceId: string }> {
  const sourceSlug = slugify(input.sourceSlug);
  const name = normalizeWhitespace(input.name);
  const baseUrl = input.baseUrl.trim();

  const source = await prisma.source.upsert({
    where: { sourceSlug },
    update: {
      name,
      baseUrl,
      cronSchedule: input.cronSchedule?.trim() ? input.cronSchedule.trim() : null,
      licenseType: input.licenseType,
      licenseNotes: input.licenseNotes?.trim() ? input.licenseNotes.trim() : null,
      allowedUse: input.allowedUse.trim(),
      attributionRequirements: input.attributionRequirements.trim(),
      accessMethod: input.accessMethod,
      robotsPolicy: input.robotsPolicy,
      trustTier: input.trustTier,
      enabled: input.enabled,
      lastVerifiedAt: input.lastVerifiedAt,
      contact: input.contact?.trim() ? input.contact.trim() : null,
    },
    create: {
      name,
      sourceSlug,
      baseUrl,
      cronSchedule: input.cronSchedule?.trim() ? input.cronSchedule.trim() : null,
      licenseType: input.licenseType,
      licenseNotes: input.licenseNotes?.trim() ? input.licenseNotes.trim() : null,
      allowedUse: input.allowedUse.trim(),
      attributionRequirements: input.attributionRequirements.trim(),
      accessMethod: input.accessMethod,
      robotsPolicy: input.robotsPolicy,
      trustTier: input.trustTier,
      enabled: input.enabled,
      lastVerifiedAt: input.lastVerifiedAt,
      contact: input.contact?.trim() ? input.contact.trim() : null,
    },
    select: { id: true },
  });

  return { sourceId: source.id };
}

async function ensureSourceDocumentAndCitation(prisma: PrismaClient, input: {
  sourceId: string;
  url: string;
  title: string;
}): Promise<{ citationId: string }> {
  const fetchedAt = new Date();
  const fetched = await fetchForHash(input.url);

  let sourceDocumentId: string;
  try {
    const created = await prisma.sourceDocument.create({
      data: {
        sourceId: input.sourceId,
        url: input.url,
        canonicalUrl: fetched.finalUrl,
        title: input.title.trim(),
        contentType: fetched.contentType,
        etag: fetched.etag ?? null,
        lastModified: fetched.lastModified ?? null,
        fetchedAt,
        contentSha256: fetched.sha256,
        snapshotAllowed: false,
        snapshotStorageUri: null,
      },
      select: { id: true },
    });
    sourceDocumentId = created.id;
  } catch {
    const existing = await prisma.sourceDocument.findFirst({
      where: { sourceId: input.sourceId, url: input.url, contentSha256: fetched.sha256 },
      select: { id: true },
    });
    if (!existing) throw new Error('Failed to create or find SourceDocument');
    sourceDocumentId = existing.id;
  }

  const existingCitation = await prisma.citation.findFirst({
    where: { sourceId: input.sourceId, sourceDocumentId, url: fetched.finalUrl },
    select: { id: true },
  });
  if (existingCitation) return { citationId: existingCitation.id };

  const source = await prisma.source.findFirst({
    where: { id: input.sourceId },
    select: { name: true, licenseNotes: true, attributionRequirements: true },
  });
  if (!source) throw new Error('Source not found for citation');

  const citation = await prisma.citation.create({
    data: {
      sourceId: input.sourceId,
      sourceDocumentId,
      url: fetched.finalUrl,
      citationText: source.name,
      licenseNote: source.licenseNotes,
      attributionText: source.attributionRequirements,
      accessedAt: fetchedAt,
    },
    select: { id: true },
  });

  return { citationId: citation.id };
}

async function ensureFieldProvenance(prisma: PrismaClient, input: {
  entityType: 'ENTRY' | 'SENSE';
  entityId: string;
  fieldName: string;
  citationId: string;
}): Promise<void> {
  const existing = await prisma.fieldProvenance.findFirst({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
    },
    select: { id: true },
  });

  if (existing) return;

  await prisma.fieldProvenance.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      citationId: input.citationId,
      contentMode: 'SUMMARIZED',
      extractionMethod: 'MANUAL',
      extractorVersion: 'synac-seed/0.1.0',
      extractedAt: new Date(),
      sourceLocator: { seeded: true },
    },
  });
}

async function ensurePublishedEntryWithOneSense(prisma: PrismaClient, input: {
  actorUserId: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug: string;
  summaryMd: string;
  sense: {
    senseLabel?: string;
    expandedForm?: string;
    definitionMd: string;
  };
  tagIds: string[];
  provenance?: { citationId: string };
}): Promise<{ entryId: string; senseId: string }> {
  const now = new Date();

  const displayTitle = normalizeWhitespace(input.displayTitle);
  const primarySlug = slugify(input.primarySlug);
  const normalizedTitle = normalizeTitle(displayTitle);

  const summaryMd = input.summaryMd.trim();
  const summaryText = markdownToText(summaryMd);
  if (!summaryMd) throw new Error('summaryMd is required');

  const existing = await prisma.entry.findFirst({
    where: { entryType: input.entryType, primarySlug, deletedAt: null },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      normalizedTitle: true,
      primarySlug: true,
      status: true,
      summaryMd: true,
      summaryText: true,
      editorialNotes: true,
      publishedAt: true,
    },
  });

  const editorialNotes = 'Seeded starter content (safe to edit/remove).';

  let entryId: string;
  if (!existing) {
    const created = await prisma.entry.create({
      data: {
        entryType: input.entryType,
        displayTitle,
        normalizedTitle,
        primarySlug,
        status: 'PUBLISHED',
        summaryMd,
        summaryText: summaryText || null,
        editorialNotes,
        publishedAt: now,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      },
      select: { id: true, entryType: true, displayTitle: true, primarySlug: true, status: true, publishedAt: true },
    });
    entryId = created.id;

    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_CREATE',
        entityType: 'ENTRY',
        entityId: created.id,
        after: toJsonSafe(created),
      },
    });
  } else {
    entryId = existing.id;

    const after = await prisma.entry.update({
      where: { id: existing.id },
      data: {
        displayTitle,
        normalizedTitle,
        primarySlug,
        summaryMd,
        summaryText: summaryText || null,
        editorialNotes,
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt ?? now,
        updatedByUserId: input.actorUserId,
      },
      select: { id: true, entryType: true, status: true, summaryMd: true, summaryText: true, publishedAt: true },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_UPDATE',
        entityType: 'ENTRY',
        entityId: existing.id,
        before: toJsonSafe(existing),
        after: toJsonSafe(after),
      },
    });
  }

  const definitionMd = input.sense.definitionMd.trim();
  const definitionText = markdownToText(definitionMd);
  if (!definitionMd) throw new Error('sense.definitionMd is required');

  const existingSense = await prisma.sense.findFirst({
    where: { entryId, senseOrder: 0, deletedAt: null },
    select: { id: true, status: true, publishedAt: true, definitionMd: true, expandedForm: true, senseLabel: true },
  });

  let senseId: string;
  if (!existingSense) {
    const created = await prisma.sense.create({
      data: {
        entryId,
        senseOrder: 0,
        senseLabel: input.sense.senseLabel?.trim() ? normalizeWhitespace(input.sense.senseLabel) : null,
        expandedForm: input.sense.expandedForm?.trim() ? normalizeWhitespace(input.sense.expandedForm) : null,
        definitionMd,
        definitionText: definitionText || null,
        isEditorial: false,
        editorialRationale: null,
        isPreferred: true,
        status: 'PUBLISHED',
        publishedAt: now,
      },
      select: { id: true, entryId: true, senseOrder: true, status: true },
    });
    senseId = created.id;

    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'SENSE_CREATE',
        entityType: 'SENSE',
        entityId: created.id,
        after: toJsonSafe(created),
      },
    });
  } else {
    senseId = existingSense.id;

    const after = await prisma.sense.update({
      where: { id: existingSense.id },
      data: {
        senseLabel: input.sense.senseLabel?.trim() ? normalizeWhitespace(input.sense.senseLabel) : null,
        expandedForm: input.sense.expandedForm?.trim() ? normalizeWhitespace(input.sense.expandedForm) : null,
        definitionMd,
        definitionText: definitionText || null,
        status: 'PUBLISHED',
        publishedAt: existingSense.publishedAt ?? now,
      },
      select: { id: true, entryId: true, senseOrder: true, status: true },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'SENSE_UPDATE',
        entityType: 'SENSE',
        entityId: existingSense.id,
        before: toJsonSafe(existingSense),
        after: toJsonSafe(after),
      },
    });
  }

  for (const tagId of input.tagIds) {
    await prisma.entryTag.upsert({
      where: { entryId_tagId: { entryId, tagId } },
      update: {},
      create: { entryId, tagId },
    });
  }

  if (input.provenance?.citationId) {
    await ensureFieldProvenance(prisma, {
      entityType: 'ENTRY',
      entityId,
      fieldName: 'summaryMd',
      citationId: input.provenance.citationId,
    });
    await ensureFieldProvenance(prisma, {
      entityType: 'SENSE',
      entityId: senseId,
      fieldName: 'definitionMd',
      citationId: input.provenance.citationId,
    });
  }

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'ENTRY_PUBLISH',
      entityType: 'ENTRY',
      entityId,
      after: toJsonSafe({ entryId, publishedAt: now.toISOString() }),
    },
  });

  return { entryId, senseId };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const { actorUserId } = await ensureSeedActor(prisma);
  const now = new Date();

  const [{ sourceId: nistSourceId }, { sourceId: mitreSourceId }, { sourceId: owaspSourceId }] = await Promise.all([
    ensureSource(prisma, {
      name: 'NIST CSRC Glossary',
      sourceSlug: 'nist-csrc-glossary',
      baseUrl: 'https://csrc.nist.gov/glossary',
      cronSchedule: null,
      licenseType: 'PUBLIC_DOMAIN',
      licenseNotes:
        'NIST states most site information is public information and may be distributed or copied, except material marked as copyrighted; attribution requested. Verify per-document markings before quoting.',
      allowedUse:
        'Public information; may be distributed or copied unless explicitly marked as copyrighted. Prefer summarization/paraphrase when in doubt.',
      attributionRequirements: 'Source: NIST CSRC Glossary (csrc.nist.gov).',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: now,
    }),
    ensureSource(prisma, {
      name: 'MITRE ATT&CK (CTI STIX Data)',
      sourceSlug: 'mitre-attack-cti',
      baseUrl: 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json',
      cronSchedule: null,
      licenseType: 'OTHER',
      licenseNotes:
        'See repository LICENSE.txt for ATT&CK terms: non-exclusive royalty-free license; reproduce MITRE copyright + license in copies. Verify requirements before publishing quoted text.',
      allowedUse:
        'Allowed for research/development/commercial under MITRE ATT&CK license; reproduce license text when required. Prefer summarization and citation links.',
      attributionRequirements: 'Source: MITRE ATT&CK (attack-stix-data).',
      accessMethod: 'API',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: now,
      contact: 'https://attack.mitre.org/resources/contact/',
    }),
    ensureSource(prisma, {
      name: 'OWASP Web Security Community (Vulnerabilities)',
      sourceSlug: 'owasp-vulnerabilities',
      baseUrl: 'https://owasp.org',
      cronSchedule: null,
      licenseType: 'CC_BY_SA_4_0',
      licenseNotes:
        'OWASP site footer states content is Creative Commons Attribution-ShareAlike v4.0 unless otherwise specified. Verify per-page exceptions.',
      allowedUse:
        'CC BY-SA 4.0 unless otherwise specified. Share-alike applies to adapted material; review before publishing quoted text.',
      attributionRequirements: 'Source: OWASP Foundation (owasp.org).',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_2',
      enabled: true,
      lastVerifiedAt: now,
      contact: 'https://owasp.org/contact/',
    }),
  ]);

  const [{ tagId: identityTagId }, { tagId: cryptoTagId }] = await Promise.all([
    ensureTag(prisma, {
      name: 'Identity',
      slug: 'identity',
      description: 'Authentication, authorization, federation, and access control.',
    }),
    ensureTag(prisma, {
      name: 'Cryptography',
      slug: 'cryptography',
      description: 'Encryption, keys, protocols, and cryptographic primitives.',
    }),
  ]);

  const authCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/authentication',
    title: 'NIST CSRC Glossary — Authentication',
  });

  const aesCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/publications/detail/fips/197/final',
    title: 'NIST FIPS 197 — Advanced Encryption Standard (AES)',
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Authentication',
    primarySlug: 'authentication',
    summaryMd:
      'Authentication is the process of verifying the identity of a user, device, or system before granting access.',
    sense: {
      senseLabel: 'Identity verification',
      definitionMd:
        'Authentication verifies *who or what* is requesting access. It is typically performed using one or more factors (something you know, have, or are), and is distinct from authorization (what you are allowed to do).',
    },
    tagIds: [identityTagId],
    provenance: authCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'ACRONYM',
    displayTitle: 'AES',
    primarySlug: 'aes',
    summaryMd:
      'AES stands for Advanced Encryption Standard, a widely used symmetric-key block cipher standardized by NIST.',
    sense: {
      senseLabel: 'Symmetric block cipher',
      expandedForm: 'Advanced Encryption Standard',
      definitionMd:
        'AES is a symmetric encryption algorithm standardized in FIPS 197. It is commonly used to protect data at rest and in transit, and is typically deployed in authenticated encryption modes (e.g., GCM) where integrity is also required.',
    },
    tagIds: [cryptoTagId],
    provenance: aesCitation,
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: 'SEED_CONTENT_OK',
      entityType: 'SYSTEM',
      entityId: crypto.randomUUID(),
      after: toJsonSafe({
        sources: { nistSourceId, mitreSourceId, owaspSourceId },
        tags: { identityTagId, cryptoTagId },
        ranAt: now.toISOString(),
      }),
    },
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

