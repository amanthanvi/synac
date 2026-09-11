import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '@synac/db';
import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { autoApplyTier1IngestItems } from './autoApplyTier1.js';

const prisma = createIntegrationTestClient();

const FETCHED_AT = new Date('2026-03-24T00:00:00.000Z');

async function createTierOneSource(overrides?: {
  licenseType?: 'CC_BY_4_0' | 'OTHER';
}) {
  return prisma.source.create({
    data: {
      name: 'Tier 1 Source',
      sourceSlug: 'tier-1-source',
      baseUrl: 'https://example.com',
      licenseType: overrides?.licenseType ?? 'CC_BY_4_0',
      allowedUse: 'Allowed',
      attributionRequirements: 'Attribution required',
      licensePublicStatement: 'Public domain statement',
      accessMethod: 'HTML',
      robotsPolicy: 'RESPECT',
      trustTier: 'TIER_1',
      enabled: true,
      lastVerifiedAt: FETCHED_AT,
    },
    select: { id: true },
  });
}

async function createSourceDocument(input: {
  sourceId: string;
  sha: string;
  url?: string;
  title?: string;
  doNotUse?: boolean;
  doNotUseReason?: string;
}) {
  return prisma.sourceDocument.create({
    data: {
      sourceId: input.sourceId,
      url: input.url ?? 'https://example.com/doc',
      canonicalUrl: input.url ?? 'https://example.com/doc',
      title: input.title ?? 'Doc',
      contentType: 'text/html',
      fetchedAt: FETCHED_AT,
      contentSha256: input.sha,
      snapshotAllowed: false,
      ...(input.doNotUse
        ? { doNotUse: true, doNotUseReason: input.doNotUseReason ?? 'Policy' }
        : {}),
    },
    select: { id: true },
  });
}

async function createRun(sourceId: string) {
  return prisma.ingestRun.create({
    data: {
      sourceId,
      startedAt: FETCHED_AT,
      finishedAt: new Date('2026-03-24T00:10:00.000Z'),
      status: 'SUCCESS',
      triggeredBy: 'MANUAL',
    },
    select: { id: true },
  });
}

async function createItem(input: {
  ingestRunId: string;
  sourceDocumentId: string;
  itemKey: string;
  proposedChange: Prisma.InputJsonValue;
  licenseGate?: 'PASS' | 'WARN' | 'FAIL';
}) {
  return prisma.ingestItem.create({
    data: {
      ingestRunId: input.ingestRunId,
      sourceDocumentId: input.sourceDocumentId,
      itemKey: input.itemKey,
      stage: 'VALIDATED',
      proposedChange: input.proposedChange,
      confidenceScore: 0.9,
      licenseGate: input.licenseGate ?? 'PASS',
    },
    select: { id: true },
  });
}

const RFC_TWO_SENSE_PAYLOAD = {
  kind: 'CREATE_ENTRY',
  entryType: 'TERM',
  displayTitle: 'domain',
  summaryMd:
    'An environment or context that includes a set of system resources.',
  senses: [
    {
      senseLabel: '1a. (I) /general security/',
      definitionMd:
        'An environment or context that includes a set of system resources and a set of system entities that have the right to access the resources.',
      contentMode: 'QUOTED',
      extractionMethod: 'API',
      extractorVersion: 'synac-worker/0.1.5+rfc4949@2',
      sourceLocator: { line: 4210, title: 'domain' },
    },
    {
      senseLabel: '1b. (O) /security policy/',
      definitionMd:
        'A set of users, their information objects, and a common security policy administered by a single authority.',
      contentMode: 'QUOTED',
      extractionMethod: 'API',
      extractorVersion: 'synac-worker/0.1.5+rfc4949@2',
      sourceLocator: { line: 4218, title: 'domain' },
    },
  ],
} satisfies Prisma.InputJsonValue;

describe('tier-1 auto apply integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    delete process.env.SYNAC_AUTOPUBLISH_WARN;
  });

  afterEach(() => {
    delete process.env.SYNAC_AUTOPUBLISH_WARN;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('auto-applies and publishes a validated Tier-1 ingest item', async () => {
    const source = await createTierOneSource();
    const sourceDocument = await createSourceDocument({
      sourceId: source.id,
      sha: 'sha256-tier1',
    });
    const run = await createRun(source.id);

    const item = await createItem({
      ingestRunId: run.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'item-1',
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
            definitionMd:
              'Security Assertion Markup Language enables federated authentication.',
          },
        ],
      },
    });

    const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });

    const entry = await prisma.entry.findFirst({
      where: { displayTitle: 'SAML', deletedAt: null },
      select: { id: true, status: true, entryType: true },
    });
    const variants = await prisma.entryVariant.findMany({
      where: { entry: { displayTitle: 'SAML', deletedAt: null } },
      select: { variantText: true },
    });
    const updatedItem = await prisma.ingestItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { stage: true, error: true },
    });

    expect(result.applied).toBe(1);
    expect(result.published).toBe(1);
    expect(entry).toMatchObject({ status: 'PUBLISHED', entryType: 'ACRONYM' });
    expect(variants.map((v) => v.variantText)).toContain(
      'Security Assertion Markup Language',
    );
    expect(updatedItem.stage).toBe('APPLIED');
    expect(updatedItem.error).toBeNull();
  });

  it('writes a sense_definition and citation carrying the document title and licence statement', async () => {
    const source = await createTierOneSource();
    const sourceDocument = await createSourceDocument({
      sourceId: source.id,
      sha: 'sha256-cite',
      title: 'Glossary page: mutual authentication',
    });
    const run = await createRun(source.id);

    await createItem({
      ingestRunId: run.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'item-cite',
      proposedChange: {
        kind: 'CREATE_ENTRY',
        entryType: 'TERM',
        displayTitle: 'Mutual authentication',
        summaryMd: 'Both parties authenticate each other.',
        senses: [{ definitionMd: 'Both parties authenticate each other.' }],
      },
    });

    await autoApplyTier1IngestItems(prisma, { maxItems: 25 });

    const citation = await prisma.citation.findFirstOrThrow({
      select: { citationText: true, licenseNote: true, attributionText: true },
    });
    expect(citation.citationText).toBe('Glossary page: mutual authentication');
    expect(citation.licenseNote).toBe('Public domain statement');
    expect(citation.attributionText).toBe('Attribution required');

    const senseDefinitions = await prisma.senseDefinition.findMany({
      select: { isPrimary: true, contentMode: true, definitionText: true },
    });
    expect(senseDefinitions).toHaveLength(1);
    expect(senseDefinitions[0]?.isPrimary).toBe(true);
  });

  it('skips do-not-use source documents during auto-apply', async () => {
    const source = await createTierOneSource();
    const sourceDocument = await createSourceDocument({
      sourceId: source.id,
      sha: 'sha256-tier1-dnu',
      doNotUse: true,
      doNotUseReason: 'Policy violation',
    });
    const run = await createRun(source.id);

    await createItem({
      ingestRunId: run.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'item-2',
      proposedChange: {
        kind: 'CREATE_ENTRY',
        entryType: 'TERM',
        displayTitle: 'Authorization',
        summaryMd: 'Authorization grants permissions.',
        senses: [{ definitionMd: 'Authorization grants permissions.' }],
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

  describe('licenseGate WARN', () => {
    async function seedWarnItem() {
      const source = await createTierOneSource({ licenseType: 'OTHER' });
      const sourceDocument = await createSourceDocument({
        sourceId: source.id,
        sha: 'sha256-warn',
      });
      const run = await createRun(source.id);

      return createItem({
        ingestRunId: run.id,
        sourceDocumentId: sourceDocument.id,
        itemKey: 'item-warn',
        licenseGate: 'WARN',
        proposedChange: {
          kind: 'CREATE_ENTRY',
          entryType: 'TERM',
          displayTitle: 'Threat modeling',
          summaryMd: 'A structured approach to identifying threats.',
          senses: [
            { definitionMd: 'A structured approach to identifying threats.' },
          ],
        },
      });
    }

    it('applies but does not publish a WARN item by default', async () => {
      const item = await seedWarnItem();

      const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });

      expect(result.applied).toBe(1);
      expect(result.published).toBe(0);
      expect(result.heldForReview).toBe(1);
      expect(result.failed).toBe(0);

      const updatedItem = await prisma.ingestItem.findUniqueOrThrow({
        where: { id: item.id },
        select: { stage: true, error: true, diff: true },
      });
      expect(updatedItem.stage).toBe('REVIEWED');
      expect(updatedItem.error).toBeNull();
      expect(JSON.stringify(updatedItem.diff)).toContain('license_gate_warn');

      // The data IS applied; only publication is withheld.
      const entry = await prisma.entry.findFirstOrThrow({
        where: { displayTitle: 'Threat modeling', deletedAt: null },
        select: { status: true },
      });
      expect(entry.status).toBe('DRAFT');
    });

    it('publishes a WARN item when SYNAC_AUTOPUBLISH_WARN is enabled', async () => {
      await seedWarnItem();
      process.env.SYNAC_AUTOPUBLISH_WARN = 'true';

      const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });

      expect(result.published).toBe(1);
      expect(result.heldForReview).toBe(0);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { displayTitle: 'Threat modeling', deletedAt: null },
        select: { status: true },
      });
      expect(entry.status).toBe('PUBLISHED');
    });
  });

  it('attaches a near-identical definition to the existing sense instead of opening a new one', async () => {
    const source = await createTierOneSource();
    const run = await createRun(source.id);

    const definition =
      'The process of verifying the identity of a user, process, or device, often as a prerequisite to allowing access to resources in an information system.';

    const entry = await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Authentication',
        normalizedTitle: 'authentication',
        primarySlug: 'authentication',
        status: 'PUBLISHED',
        summaryMd: definition,
        summaryText: definition,
        publishedAt: FETCHED_AT,
      },
      select: { id: true },
    });

    const existingSense = await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: 0,
        senseLabel: 'NIST SP 800-53 Rev. 5',
        slug: 'nist-sp-800-53-rev-5',
        definitionMd: definition,
        definitionText: definition,
        isPreferred: true,
        status: 'PUBLISHED',
        publishedAt: FETCHED_AT,
      },
      select: { id: true },
    });

    // A second source restating the same meaning with trivial wording drift.
    const sourceDocument = await createSourceDocument({
      sourceId: source.id,
      sha: 'sha256-attach',
      url: 'https://example.com/authentication',
    });

    await createItem({
      ingestRunId: run.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'item-attach',
      proposedChange: {
        kind: 'CREATE_ENTRY',
        entryType: 'TERM',
        displayTitle: 'Authentication',
        summaryMd: definition,
        senses: [
          {
            senseLabel: 'CNSSI 4009-2015',
            definitionMd: `${definition} See also identification.`,
          },
        ],
      },
    });

    const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });
    expect(result.failed).toBe(0);

    const senses = await prisma.sense.findMany({
      where: { entryId: entry.id, deletedAt: null },
      select: { id: true },
    });
    expect(senses).toHaveLength(1);
    expect(senses[0]?.id).toBe(existingSense.id);

    const definitions = await prisma.senseDefinition.findMany({
      where: { senseId: existingSense.id },
      select: { isPrimary: true, similarityToPrimary: true },
    });
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.isPrimary).toBe(true);

    // The attached attestation must not overwrite the sense's own wording.
    const sense = await prisma.sense.findUniqueOrThrow({
      where: { id: existingSense.id },
      select: { definitionMd: true },
    });
    expect(sense.definitionMd).toBe(definition);
  });

  it('holds publication when a new sense needs a label on an already-published entry', async () => {
    const source = await createTierOneSource();
    const run = await createRun(source.id);

    const entry = await prisma.entry.create({
      data: {
        entryType: 'ACRONYM',
        displayTitle: 'SOC',
        normalizedTitle: 'soc',
        primarySlug: 'soc',
        status: 'PUBLISHED',
        summaryMd:
          'A centralized unit that monitors and defends an organization.',
        summaryText:
          'A centralized unit that monitors and defends an organization.',
        publishedAt: FETCHED_AT,
      },
      select: { id: true },
    });

    await prisma.sense.create({
      data: {
        entryId: entry.id,
        senseOrder: 0,
        senseLabel: 'Security Operations Center',
        slug: 'security-operations-center',
        definitionMd:
          'A centralized unit that monitors and defends an organization.',
        definitionText:
          'A centralized unit that monitors and defends an organization.',
        isPreferred: true,
        status: 'PUBLISHED',
        publishedAt: FETCHED_AT,
      },
    });

    const sourceDocument = await createSourceDocument({
      sourceId: source.id,
      sha: 'sha256-needs-label',
      url: 'https://example.com/soc',
    });

    // Unrelated meaning, and the proposal carries no sense label.
    const item = await createItem({
      ingestRunId: run.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'item-needs-label',
      proposedChange: {
        kind: 'CREATE_ENTRY',
        entryType: 'ACRONYM',
        displayTitle: 'SOC',
        summaryMd: 'An auditing report on service organization controls.',
        senses: [
          {
            definitionMd:
              'An auditing report published under the AICPA framework covering service organization controls.',
          },
        ],
      },
    });

    const result = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });

    expect(result.applied).toBe(1);
    expect(result.published).toBe(0);
    expect(result.heldForReview).toBe(1);

    const updatedItem = await prisma.ingestItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { stage: true, error: true, diff: true },
    });
    expect(updatedItem.stage).toBe('REVIEWED');
    expect(updatedItem.error).toBeNull();
    expect(JSON.stringify(updatedItem.diff)).toContain('needs_label');

    const senses = await prisma.sense.findMany({
      where: { entryId: entry.id, deletedAt: null },
      orderBy: [{ senseOrder: 'asc' }],
      select: { needsLabel: true, status: true, slug: true },
    });
    expect(senses).toHaveLength(2);
    expect(senses[0]?.needsLabel).toBe(false);
    expect(senses[1]?.needsLabel).toBe(true);
    // The newly opened sense must not go live behind the reviewer's back.
    expect(senses[1]?.status).toBe('DRAFT');
  });

  it('creates one sense per proposed definition and does not collapse them on re-apply', async () => {
    const source = await createTierOneSource();
    const run = await createRun(source.id);
    const sourceDocument = await createSourceDocument({
      sourceId: source.id,
      sha: 'sha256-rfc',
      url: 'https://example.com/rfc4949',
      title: 'RFC 4949',
    });

    await createItem({
      ingestRunId: run.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'term:domain',
      proposedChange: RFC_TWO_SENSE_PAYLOAD,
    });

    const firstPass = await autoApplyTier1IngestItems(prisma, { maxItems: 25 });
    expect(firstPass.failed).toBe(0);

    const entry = await prisma.entry.findFirstOrThrow({
      where: { normalizedTitle: 'domain', deletedAt: null },
      select: { id: true },
    });

    const afterFirst = await prisma.sense.findMany({
      where: { entryId: entry.id, deletedAt: null },
      orderBy: [{ senseOrder: 'asc' }],
      select: { id: true, senseLabel: true, slug: true, definitionMd: true },
    });

    expect(afterFirst).toHaveLength(2);
    expect(afterFirst.map((s) => s.senseLabel)).toEqual([
      '1a. (I) /general security/',
      '1b. (O) /security policy/',
    ]);
    expect(new Set(afterFirst.map((s) => s.slug)).size).toBe(2);

    // Re-ingest the identical payload from a later run.
    const secondRun = await createRun(source.id);
    const reapplied = await createItem({
      ingestRunId: secondRun.id,
      sourceDocumentId: sourceDocument.id,
      itemKey: 'term:domain',
      proposedChange: RFC_TWO_SENSE_PAYLOAD,
    });

    const secondPass = await autoApplyTier1IngestItems(prisma, {
      maxItems: 25,
    });
    expect(secondPass.failed).toBe(0);

    const afterSecond = await prisma.sense.findMany({
      where: { entryId: entry.id, deletedAt: null },
      orderBy: [{ senseOrder: 'asc' }],
      select: { id: true, senseLabel: true, definitionMd: true },
    });

    expect(afterSecond).toHaveLength(2);
    expect(afterSecond.map((s) => s.id)).toEqual(afterFirst.map((s) => s.id));
    expect(afterSecond[0]?.definitionMd).toBe(afterFirst[0]?.definitionMd);
    expect(afterSecond[1]?.definitionMd).toBe(afterFirst[1]?.definitionMd);
    expect(afterSecond[0]?.definitionMd).not.toBe(afterSecond[1]?.definitionMd);

    const updated = await prisma.ingestItem.findUniqueOrThrow({
      where: { id: reapplied.id },
      select: { stage: true },
    });
    expect(updated.stage).toBe('APPLIED');

    // One attestation per (sense, citation): the re-apply upserts, never duplicates.
    const senseDefinitions = await prisma.senseDefinition.findMany({
      where: { senseId: { in: afterSecond.map((s) => s.id) } },
      select: { senseId: true },
    });
    expect(senseDefinitions).toHaveLength(2);
  });
});
