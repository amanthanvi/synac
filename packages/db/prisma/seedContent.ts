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
      entityId: entryId,
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
      entityId: entryId,
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

  const [
    { tagId: identityTagId },
    { tagId: cryptoTagId },
    { tagId: accessControlTagId },
    { tagId: networkSecurityTagId },
    { tagId: threatsTagId },
    { tagId: fundamentalsTagId },
  ] = await Promise.all([
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
    ensureTag(prisma, {
      name: 'Access Control',
      slug: 'access-control',
      description: 'Authorization, least privilege, and access enforcement.',
    }),
    ensureTag(prisma, {
      name: 'Network Security',
      slug: 'network-security',
      description: 'Network resilience, protocols, and denial-of-service defenses.',
    }),
    ensureTag(prisma, {
      name: 'Threats',
      slug: 'threats',
      description: 'Malware, phishing, and common attack patterns.',
    }),
    ensureTag(prisma, {
      name: 'Fundamentals',
      slug: 'fundamentals',
      description: 'Core security properties and building blocks (CIA, crypto basics).',
    }),
  ]);

  const authCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/authentication',
    title: 'NIST CSRC Glossary — Authentication',
  });

  const authorizationCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/authorization',
    title: 'NIST CSRC Glossary — Authorization',
  });

  const accessControlCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/access_control',
    title: 'NIST CSRC Glossary — Access control',
  });

  const confidentialityCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/confidentiality',
    title: 'NIST CSRC Glossary — Confidentiality',
  });

  const integrityCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/integrity',
    title: 'NIST CSRC Glossary — Integrity',
  });

  const availabilityCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/availability',
    title: 'NIST CSRC Glossary — Availability',
  });

  const leastPrivilegeCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/least_privilege',
    title: 'NIST CSRC Glossary — Least privilege',
  });

  const mfaCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/multi_factor_authentication',
    title: 'NIST CSRC Glossary — Multi-factor authentication',
  });

  const ssoCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/single_sign_on',
    title: 'NIST CSRC Glossary — Single sign-on',
  });

  const phishingCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/phishing',
    title: 'NIST CSRC Glossary — Phishing',
  });

  const malwareCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/malware',
    title: 'NIST CSRC Glossary — Malware',
  });

  const encryptionCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/encryption',
    title: 'NIST CSRC Glossary — Encryption',
  });

  const publicKeyCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/public_key',
    title: 'NIST CSRC Glossary — Public key',
  });

  const symmetricKeyCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/symmetric_key',
    title: 'NIST CSRC Glossary — Symmetric key',
  });

  const hashFunctionCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/hash_function',
    title: 'NIST CSRC Glossary — Hash function',
  });

  const dosCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/denial_of_service',
    title: 'NIST CSRC Glossary — Denial of service',
  });

  const ddosCitation = await ensureSourceDocumentAndCitation(prisma, {
    sourceId: nistSourceId,
    url: 'https://csrc.nist.gov/glossary/term/distributed_denial_of_service',
    title: 'NIST CSRC Glossary — Distributed denial of service',
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

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Authorization',
    primarySlug: 'authorization',
    summaryMd: 'Authorization is the process of determining what an authenticated principal is permitted to do.',
    sense: {
      senseLabel: 'Access decision',
      definitionMd:
        'Authorization is the decision step that follows authentication. It evaluates policies and context to determine whether a request should be allowed (e.g., which resources, actions, and conditions apply).',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: authorizationCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Access Control',
    primarySlug: 'access-control',
    summaryMd:
      'Access control is the set of mechanisms and policies used to restrict access to resources and enforce authorization decisions.',
    sense: {
      senseLabel: 'Policy + enforcement',
      definitionMd:
        'Access control combines policy (what is allowed) with enforcement mechanisms (how it is enforced). Common models include discretionary, mandatory, and role-based access control; modern systems often implement attribute-based rules.',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: accessControlCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Confidentiality',
    primarySlug: 'confidentiality',
    summaryMd: 'Confidentiality is the property that information is not disclosed to unauthorized parties.',
    sense: {
      senseLabel: 'No unauthorized disclosure',
      definitionMd:
        'Confidentiality focuses on preventing unauthorized disclosure of information. It is commonly supported by access control, encryption, and careful handling of sensitive data (including metadata).',
    },
    tagIds: [fundamentalsTagId],
    provenance: confidentialityCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Integrity',
    primarySlug: 'integrity',
    summaryMd: 'Integrity is the property that data is accurate and has not been improperly modified or destroyed.',
    sense: {
      senseLabel: 'No unauthorized modification',
      definitionMd:
        'Integrity ensures that data and systems are not altered in an unauthorized or undetected way. Techniques include cryptographic hashes, digital signatures, authenticated encryption, and strong change controls.',
    },
    tagIds: [fundamentalsTagId],
    provenance: integrityCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Availability',
    primarySlug: 'availability',
    summaryMd: 'Availability is the property that systems and data are accessible and usable when needed.',
    sense: {
      senseLabel: 'Accessible when required',
      definitionMd:
        'Availability focuses on keeping services usable for legitimate users. It is supported by redundancy, capacity planning, incident response, and protections against denial-of-service attacks.',
    },
    tagIds: [fundamentalsTagId, networkSecurityTagId],
    provenance: availabilityCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Least Privilege',
    primarySlug: 'least-privilege',
    summaryMd: 'Least privilege means granting only the minimum access necessary to perform an authorized task.',
    sense: {
      senseLabel: 'Minimize access',
      definitionMd:
        'Least privilege reduces blast radius by limiting accounts, roles, and services to only the permissions they need, only for the time they need them. It is a key control for both humans and service identities.',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: leastPrivilegeCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Multi-factor Authentication',
    primarySlug: 'multi-factor-authentication',
    summaryMd: 'Multi-factor authentication (MFA) uses two or more independent factors to verify identity.',
    sense: {
      senseLabel: 'Identity verification',
      definitionMd:
        'MFA strengthens authentication by combining independent factors (e.g., something you know, have, or are). It helps mitigate credential theft but must be implemented carefully (e.g., phishing-resistant methods where feasible).',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: mfaCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'ACRONYM',
    displayTitle: 'MFA',
    primarySlug: 'mfa',
    summaryMd: 'MFA stands for Multi-factor Authentication, an authentication method using multiple factors.',
    sense: {
      senseLabel: 'Multiple factors',
      expandedForm: 'Multi-factor Authentication',
      definitionMd:
        'MFA requires at least two independent factors to authenticate a user. Prefer phishing-resistant factors (e.g., hardware-backed keys) for high-risk admin access.',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: mfaCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Single Sign-on',
    primarySlug: 'single-sign-on',
    summaryMd: 'Single sign-on (SSO) allows a user to authenticate once and access multiple services without re-authenticating.',
    sense: {
      senseLabel: 'Federated login',
      definitionMd:
        'SSO centralizes authentication at an identity provider and reduces password reuse. It can improve security and user experience, but increases reliance on the identity system and requires strong controls and monitoring.',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: ssoCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'ACRONYM',
    displayTitle: 'SSO',
    primarySlug: 'sso',
    summaryMd: 'SSO stands for Single Sign-on, enabling access to multiple services with one authentication event.',
    sense: {
      senseLabel: 'Single login session',
      expandedForm: 'Single Sign-on',
      definitionMd:
        'SSO is typically implemented using federation protocols or centralized identity. Strong MFA and session controls help reduce the blast radius of compromised accounts.',
    },
    tagIds: [identityTagId, accessControlTagId],
    provenance: ssoCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Phishing',
    primarySlug: 'phishing',
    summaryMd: 'Phishing is a form of social engineering that attempts to trick targets into revealing sensitive information or taking harmful actions.',
    sense: {
      senseLabel: 'Social engineering',
      definitionMd:
        'Phishing often uses spoofed emails, messages, or websites to induce victims to disclose credentials, install malware, or approve fraudulent transactions. Defenses include user education, filtering, and phishing-resistant authentication.',
    },
    tagIds: [threatsTagId],
    provenance: phishingCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Malware',
    primarySlug: 'malware',
    summaryMd: 'Malware is malicious software designed to disrupt, damage, or gain unauthorized access to systems and data.',
    sense: {
      senseLabel: 'Malicious software',
      definitionMd:
        'Malware includes viruses, worms, trojans, spyware, and ransomware. It is commonly delivered through phishing, drive-by downloads, and exploited vulnerabilities.',
    },
    tagIds: [threatsTagId],
    provenance: malwareCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Denial of Service',
    primarySlug: 'denial-of-service',
    summaryMd: 'A denial-of-service (DoS) attack attempts to make a system or network unavailable to legitimate users.',
    sense: {
      senseLabel: 'Availability attack',
      definitionMd:
        'DoS attacks can exhaust resources (bandwidth, CPU, memory, connections) or exploit protocol/application weaknesses. Mitigations include rate limiting, filtering, and resilient architecture.',
    },
    tagIds: [networkSecurityTagId, threatsTagId],
    provenance: dosCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'ACRONYM',
    displayTitle: 'DoS',
    primarySlug: 'dos',
    summaryMd: 'DoS stands for Denial of Service, an attack targeting system availability.',
    sense: {
      senseLabel: 'Availability disruption',
      expandedForm: 'Denial of Service',
      definitionMd:
        'DoS attacks aim to disrupt availability by overwhelming or crashing a target. Distributed variants (DDoS) amplify the attack using many sources.',
    },
    tagIds: [networkSecurityTagId, threatsTagId],
    provenance: dosCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Distributed Denial of Service',
    primarySlug: 'distributed-denial-of-service',
    summaryMd: 'A distributed denial-of-service (DDoS) attack uses many systems to overwhelm a target and degrade availability.',
    sense: {
      senseLabel: 'Distributed availability attack',
      definitionMd:
        'DDoS attacks distribute traffic or requests across many sources (botnets, reflected/amplified traffic) to saturate bandwidth or exhaust application resources. Defenses include upstream filtering and traffic engineering.',
    },
    tagIds: [networkSecurityTagId, threatsTagId],
    provenance: ddosCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'ACRONYM',
    displayTitle: 'DDoS',
    primarySlug: 'ddos',
    summaryMd: 'DDoS stands for Distributed Denial of Service, a DoS attack carried out from many sources.',
    sense: {
      senseLabel: 'Distributed attack',
      expandedForm: 'Distributed Denial of Service',
      definitionMd:
        'DDoS uses multiple traffic sources to overwhelm a target. Common strategies include volumetric attacks, protocol attacks, and application-layer floods.',
    },
    tagIds: [networkSecurityTagId, threatsTagId],
    provenance: ddosCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Encryption',
    primarySlug: 'encryption',
    summaryMd: 'Encryption is the process of transforming information so it is unintelligible without the appropriate key.',
    sense: {
      senseLabel: 'Confidentiality control',
      definitionMd:
        'Encryption protects confidentiality by converting plaintext into ciphertext using a cryptographic algorithm and key. Correct key management and authenticated encryption modes are critical in practice.',
    },
    tagIds: [cryptoTagId, fundamentalsTagId],
    provenance: encryptionCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Hash Function',
    primarySlug: 'hash-function',
    summaryMd: 'A hash function maps input data to a fixed-size output (digest) and is commonly used for integrity checks.',
    sense: {
      senseLabel: 'Digest',
      definitionMd:
        'Cryptographic hash functions are designed to make it infeasible to find collisions or reverse the digest. Hashes are used for integrity, signatures, and password storage (with appropriate slow hashing).',
    },
    tagIds: [cryptoTagId],
    provenance: hashFunctionCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Public Key',
    primarySlug: 'public-key',
    summaryMd: 'A public key is the publicly shared component of an asymmetric key pair used for encryption or signature verification.',
    sense: {
      senseLabel: 'Asymmetric cryptography',
      definitionMd:
        'In public-key cryptography, the public key can be shared widely while the private key is kept secret. Public keys are used to verify signatures and (in some schemes) encrypt data for the private-key holder.',
    },
    tagIds: [cryptoTagId],
    provenance: publicKeyCitation,
  });

  await ensurePublishedEntryWithOneSense(prisma, {
    actorUserId,
    entryType: 'TERM',
    displayTitle: 'Symmetric Key',
    primarySlug: 'symmetric-key',
    summaryMd: 'A symmetric key is a secret key shared between parties and used for both encryption and decryption.',
    sense: {
      senseLabel: 'Shared secret',
      definitionMd:
        'Symmetric cryptography uses the same key to encrypt and decrypt. It is efficient for bulk data encryption but requires a secure way to distribute and rotate keys.',
    },
    tagIds: [cryptoTagId],
    provenance: symmetricKeyCitation,
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: 'SEED_CONTENT_OK',
      entityType: 'SYSTEM',
      entityId: crypto.randomUUID(),
      after: toJsonSafe({
        sources: { nistSourceId, mitreSourceId, owaspSourceId },
        tags: { identityTagId, cryptoTagId, accessControlTagId, networkSecurityTagId, threatsTagId, fundamentalsTagId },
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
