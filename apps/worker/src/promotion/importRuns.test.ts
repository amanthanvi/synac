import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationStagingTestClient,
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db';

import { importEligibleStagingRuns } from './importRuns.js';

const prod = createIntegrationTestClient();
const staging = createIntegrationStagingTestClient();

async function createSourcePair() {
  const prodSource = await prod.source.create({
    data: {
      name: 'Test Source',
      sourceSlug: 'test-source',
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

  const stagingSource = await staging.source.create({
    data: {
      name: 'Test Source',
      sourceSlug: 'test-source',
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

  return { prodSource, stagingSource };
}

describe('promotion import runs integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prod);
    await resetIntegrationDatabase(staging);
  });

  afterAll(async () => {
    await prod.$disconnect();
    await staging.$disconnect();
  });

  it('imports validated staging items into prod', async () => {
    const { stagingSource } = await createSourcePair();

    const sourceDocument = await staging.sourceDocument.create({
      data: {
        sourceId: stagingSource.id,
        url: 'https://example.com/doc',
        canonicalUrl: 'https://example.com/doc',
        title: 'Doc',
        contentType: 'text/html',
        fetchedAt: new Date('2026-03-24T00:00:00.000Z'),
        contentSha256: 'sha256-test',
        snapshotAllowed: false,
      },
      select: { id: true },
    });

    const run = await staging.ingestRun.create({
      data: {
        sourceId: stagingSource.id,
        startedAt: new Date('2026-03-24T00:00:00.000Z'),
        finishedAt: new Date('2026-03-24T00:10:00.000Z'),
        status: 'SUCCESS',
        triggeredBy: 'MANUAL',
      },
      select: { id: true },
    });

    await staging.ingestItem.create({
      data: {
        ingestRunId: run.id,
        sourceDocumentId: sourceDocument.id,
        itemKey: 'item-1',
        stage: 'VALIDATED',
        proposedChange: {
          kind: 'CREATE_ENTRY',
          entryType: 'TERM',
          displayTitle: 'Authentication',
          summaryMd: 'Authentication verifies identity.',
          senses: [{ definitionMd: 'Authentication verifies identity.' }],
        },
        stageOutputs: {
          normalized: {
            proposedChange: {
              kind: 'CREATE_ENTRY',
              entryType: 'TERM',
              displayTitle: 'Authentication',
              summaryMd: 'Authentication verifies identity.',
              senses: [{ definitionMd: 'Authentication verifies identity.' }],
            },
          },
        },
        confidenceScore: 0.9,
        licenseGate: 'PASS',
      },
    });

    const result = await importEligibleStagingRuns(prod, staging, {
      maxRuns: 20,
      maxItemsPerRun: 1000,
    });

    const importedRun = await prod.ingestRun.findUnique({ where: { id: run.id } });
    const importedItems = await prod.ingestItem.findMany({
      where: { ingestRunId: run.id },
      select: { itemKey: true },
    });

    expect(result).toEqual({ runsImported: 1, itemsImported: 1 });
    expect(importedRun).not.toBeNull();
    expect(importedItems.map((item) => item.itemKey)).toContain('item-1');
  });

  it('skips do-not-use staging items', async () => {
    const { stagingSource } = await createSourcePair();

    const sourceDocument = await staging.sourceDocument.create({
      data: {
        sourceId: stagingSource.id,
        url: 'https://example.com/doc',
        canonicalUrl: 'https://example.com/doc',
        title: 'Doc',
        contentType: 'text/html',
        fetchedAt: new Date('2026-03-24T00:00:00.000Z'),
        contentSha256: 'sha256-test',
        snapshotAllowed: false,
        doNotUse: true,
      },
      select: { id: true },
    });

    const run = await staging.ingestRun.create({
      data: {
        sourceId: stagingSource.id,
        startedAt: new Date('2026-03-24T00:00:00.000Z'),
        finishedAt: new Date('2026-03-24T00:10:00.000Z'),
        status: 'SUCCESS',
        triggeredBy: 'MANUAL',
      },
      select: { id: true },
    });

    await staging.ingestItem.create({
      data: {
        ingestRunId: run.id,
        sourceDocumentId: sourceDocument.id,
        itemKey: 'item-1',
        stage: 'VALIDATED',
        proposedChange: {
          kind: 'CREATE_ENTRY',
          entryType: 'TERM',
          displayTitle: 'Authorization',
          summaryMd: 'Authorization grants permissions.',
          senses: [{ definitionMd: 'Authorization grants permissions.' }],
        },
        stageOutputs: {
          normalized: {
            proposedChange: {
              kind: 'CREATE_ENTRY',
              entryType: 'TERM',
              displayTitle: 'Authorization',
              summaryMd: 'Authorization grants permissions.',
              senses: [{ definitionMd: 'Authorization grants permissions.' }],
            },
          },
        },
        confidenceScore: 0.9,
        licenseGate: 'PASS',
      },
    });

    const result = await importEligibleStagingRuns(prod, staging, {
      maxRuns: 20,
      maxItemsPerRun: 1000,
    });

    const importedItems = await prod.ingestItem.findMany({
      where: { ingestRunId: run.id },
      select: { id: true },
    });

    expect(result).toEqual({ runsImported: 1, itemsImported: 0 });
    expect(importedItems).toHaveLength(0);
  });
});
