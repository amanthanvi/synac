import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db';

import { autoApplyTier1IngestItems } from './autoApplyTier1.js';

const prisma = createIntegrationTestClient();

async function createTierOneSource() {
  return prisma.source.create({
    data: {
      name: 'Tier 1 Source',
      sourceSlug: 'tier-1-source',
      baseUrl: 'https://example.com',
      licenseType: 'CC_BY_4_0',
      allowedUse: 'Allowed',
      attributionRequirements: 'Attribution required',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });
}

describe('tier-1 auto apply integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('auto-applies and publishes a validated Tier-1 ingest item', async () => {
    const source = await createTierOneSource();

    const sourceDocument = await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: 'https://example.com/doc',
        canonicalUrl: 'https://example.com/doc',
        title: 'Doc',
        contentType: 'text/html',
        fetchedAt: new Date('2026-03-24T00:00:00.000Z'),
        contentSha256: 'sha256-tier1',
        snapshotAllowed: false,
      },
      select: { id: true },
    });

    const run = await prisma.ingestRun.create({
      data: {
        sourceId: source.id,
        startedAt: new Date('2026-03-24T00:00:00.000Z'),
        finishedAt: new Date('2026-03-24T00:10:00.000Z'),
        status: 'SUCCESS',
        triggeredBy: 'MANUAL',
      },
      select: { id: true },
    });

    const item = await prisma.ingestItem.create({
      data: {
        ingestRunId: run.id,
        sourceDocumentId: sourceDocument.id,
        itemKey: 'item-1',
        stage: 'VALIDATED',
        proposedChange: {
          kind: 'CREATE_ENTRY',
          entryType: 'ACRONYM',
          displayTitle: 'SAML',
          summaryMd: 'Security Assertion Markup Language.',
          variants: [
            {
              variantText: 'Security Assertion Markup Language',
              variantType: 'SYNONYM',
            },
          ],
          senses: [
            {
              expandedForm: 'Security Assertion Markup Language',
              definitionMd: 'Security Assertion Markup Language enables federated authentication.',
            },
          ],
        },
        confidenceScore: 0.9,
        licenseGate: 'PASS',
      },
      select: { id: true },
    });

    const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });

    const entry = await prisma.entry.findFirst({
      where: { displayTitle: 'SAML', deletedAt: null },
      select: { status: true, entryType: true },
    });
    const variants = await prisma.entryVariant.findMany({
      where: { entry: { displayTitle: 'SAML', deletedAt: null } },
      select: { variantText: true },
    });
    const updatedItem = await prisma.ingestItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { stage: true },
    });

    expect(result.applied).toBe(1);
    expect(entry).toMatchObject({ status: 'PUBLISHED', entryType: 'ACRONYM' });
    expect(variants.map((variant) => variant.variantText)).toContain(
      'Security Assertion Markup Language',
    );
    expect(updatedItem.stage).toBe('APPLIED');
  });

  it('skips do-not-use source documents during auto-apply', async () => {
    const source = await createTierOneSource();

    const sourceDocument = await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        url: 'https://example.com/doc',
        canonicalUrl: 'https://example.com/doc',
        title: 'Doc',
        contentType: 'text/html',
        fetchedAt: new Date('2026-03-24T00:00:00.000Z'),
        contentSha256: 'sha256-tier1-dnu',
        snapshotAllowed: false,
        doNotUse: true,
        doNotUseReason: 'Policy violation',
      },
      select: { id: true },
    });

    const run = await prisma.ingestRun.create({
      data: {
        sourceId: source.id,
        startedAt: new Date('2026-03-24T00:00:00.000Z'),
        finishedAt: new Date('2026-03-24T00:10:00.000Z'),
        status: 'SUCCESS',
        triggeredBy: 'MANUAL',
      },
      select: { id: true },
    });

    await prisma.ingestItem.create({
      data: {
        ingestRunId: run.id,
        sourceDocumentId: sourceDocument.id,
        itemKey: 'item-2',
        stage: 'VALIDATED',
        proposedChange: {
          kind: 'CREATE_ENTRY',
          entryType: 'TERM',
          displayTitle: 'Authorization',
          summaryMd: 'Authorization grants permissions.',
          senses: [{ definitionMd: 'Authorization grants permissions.' }],
        },
        confidenceScore: 0.9,
        licenseGate: 'PASS',
      },
    });

    const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });
    const entry = await prisma.entry.findFirst({
      where: { displayTitle: 'Authorization', deletedAt: null },
      select: { id: true },
    });

    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(entry).toBeNull();
  });
});
