import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import {
  parseContentEntryDocument,
  resolveDefaultContentDir,
  syncContentDirectory,
} from './contentSync.js';

const prisma = createIntegrationTestClient();

const tempDirs: string[] = [];

async function createContentDir(
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'synac-content-'));
  tempDirs.push(dir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }

  return dir;
}

async function createPublishedEntry(input: {
  entryType: 'TERM' | 'ACRONYM';
  slug: string;
  displayTitle: string;
}): Promise<{ id: string }> {
  return prisma.entry.create({
    data: {
      entryType: input.entryType,
      displayTitle: input.displayTitle,
      normalizedTitle: input.displayTitle.toLowerCase(),
      primarySlug: input.slug,
      status: 'PUBLISHED',
      summaryMd: `${input.displayTitle} summary.`,
    },
    select: { id: true },
  });
}

async function createSense(input: {
  entryId: string;
  slug: string;
  senseOrder: number;
  isPreferred?: boolean;
}): Promise<{ id: string }> {
  return prisma.sense.create({
    data: {
      entryId: input.entryId,
      senseOrder: input.senseOrder,
      slug: input.slug,
      definitionMd: `Definition for ${input.slug}.`,
      status: 'PUBLISHED',
      isPreferred: input.isPreferred ?? false,
    },
    select: { id: true },
  });
}

describe('editorial content sync integration', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('applies a sense label and disambiguation note to a published entry', async () => {
    const entry = await createPublishedEntry({
      entryType: 'ACRONYM',
      slug: 'soc',
      displayTitle: 'SOC',
    });
    const sense = await createSense({
      entryId: entry.id,
      slug: 'security-operations-center',
      senseOrder: 1,
    });

    const contentDir = await createContentDir({
      'entries/acronym/soc.yaml': [
        'entryType: ACRONYM',
        'slug: soc',
        'senses:',
        '  - slug: security-operations-center',
        '    label: Security Operations Center',
        '    disambiguationNote: The staffed monitoring and response function.',
        '',
      ].join('\n'),
    });

    const result = await syncContentDirectory(prisma, { contentDir });

    const updated = await prisma.sense.findUniqueOrThrow({
      where: { id: sense.id },
      select: { senseLabel: true, disambiguationNote: true },
    });
    const auditEvents = await prisma.auditEvent.findMany({
      where: { entityType: 'SENSE', entityId: sense.id },
      select: { action: true },
    });

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({
      filesScanned: 1,
      filesValid: 1,
      filesInvalid: 0,
      entriesMatched: 1,
      entriesSkipped: 0,
      changesApplied: 1,
    });
    expect(updated).toEqual({
      senseLabel: 'Security Operations Center',
      disambiguationNote: 'The staffed monitoring and response function.',
    });
    expect(auditEvents.map((event) => event.action)).toEqual(['SENSE_UPDATE']);
  });

  it('skips unknown entry slugs without throwing or recording errors', async () => {
    const contentDir = await createContentDir({
      'entries/term/nonexistent.yaml': [
        'entryType: TERM',
        'slug: definitely-not-in-the-database',
        'senses:',
        '  - slug: some-sense',
        '    label: Some Sense',
        '',
      ].join('\n'),
    });

    const result = await syncContentDirectory(prisma, { contentDir });

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({
      filesScanned: 1,
      filesValid: 1,
      filesInvalid: 0,
      entriesMatched: 0,
      entriesSkipped: 1,
      changesApplied: 0,
    });
  });

  it('records invalid files without aborting the remaining files', async () => {
    const entry = await createPublishedEntry({
      entryType: 'TERM',
      slug: 'authentication',
      displayTitle: 'Authentication',
    });
    await createSense({
      entryId: entry.id,
      slug: 'identity-verification',
      senseOrder: 1,
    });

    const contentDir = await createContentDir({
      'entries/term/broken.yaml': 'slug: missing-entry-type\n',
      'entries/term/authentication.yaml': [
        'entryType: TERM',
        'slug: authentication',
        'senses:',
        '  - slug: identity-verification',
        '    label: Identity verification',
        '',
      ].join('\n'),
    });

    const result = await syncContentDirectory(prisma, { contentDir });

    expect(result.filesScanned).toBe(2);
    expect(result.filesInvalid).toBe(1);
    expect(result.filesValid).toBe(1);
    expect(result.entriesMatched).toBe(1);
    expect(result.changesApplied).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('entryType');
  });

  it('is idempotent across senses, tags, and relationships', async () => {
    const entry = await createPublishedEntry({
      entryType: 'ACRONYM',
      slug: 'soc',
      displayTitle: 'SOC',
    });
    await createSense({
      entryId: entry.id,
      slug: 'security-operations-center',
      senseOrder: 1,
    });
    await createPublishedEntry({
      entryType: 'ACRONYM',
      slug: 'noc',
      displayTitle: 'NOC',
    });
    await createPublishedEntry({
      entryType: 'TERM',
      slug: 'incident-response',
      displayTitle: 'Incident response',
    });
    await prisma.tag.create({
      data: { name: 'Operations', slug: 'operations', kind: 'DOMAIN' },
      select: { id: true },
    });

    const contentDir = await createContentDir({
      'entries/acronym/soc.yaml': [
        'entryType: ACRONYM',
        'slug: soc',
        'senses:',
        '  - slug: security-operations-center',
        '    label: Security Operations Center',
        '    preferred: true',
        '    confusedWith:',
        '      - slug: noc',
        '        entryType: ACRONYM',
        '        note: Availability versus security monitoring.',
        'tags:',
        '  - slug: operations',
        '    assignedBy: EDITORIAL',
        'relationships:',
        '  - type: RELATED',
        '    targetSlug: incident-response',
        '    targetEntryType: TERM',
        '',
      ].join('\n'),
    });

    const first = await syncContentDirectory(prisma, { contentDir });
    const second = await syncContentDirectory(prisma, { contentDir });

    const relationships = await prisma.entryRelationship.findMany({
      where: { fromEntryId: entry.id, deletedAt: null },
      select: { relationshipType: true },
    });
    const entryTags = await prisma.entryTag.findMany({
      where: { entryId: entry.id },
      select: { assignedBy: true },
    });

    expect(first.errors).toEqual([]);
    expect(first.changesApplied).toBe(4);
    expect(second.errors).toEqual([]);
    expect(second.changesApplied).toBe(0);
    expect(second.entriesMatched).toBe(1);
    expect(relationships.map((row) => row.relationshipType).sort()).toEqual([
      'OFTEN_CONFUSED_WITH',
      'RELATED',
    ]);
    expect(entryTags).toEqual([{ assignedBy: 'EDITORIAL' }]);
  });

  it('demotes sibling preferred senses so only one stays preferred', async () => {
    const entry = await createPublishedEntry({
      entryType: 'ACRONYM',
      slug: 'soc',
      displayTitle: 'SOC',
    });
    const primary = await createSense({
      entryId: entry.id,
      slug: 'security-operations-center',
      senseOrder: 1,
    });
    const sibling = await createSense({
      entryId: entry.id,
      slug: 'system-and-organization-controls',
      senseOrder: 2,
      isPreferred: true,
    });

    const contentDir = await createContentDir({
      'entries/acronym/soc.yaml': [
        'entryType: ACRONYM',
        'slug: soc',
        'senses:',
        '  - slug: security-operations-center',
        '    preferred: true',
        '',
      ].join('\n'),
    });

    const result = await syncContentDirectory(prisma, { contentDir });

    const senses = await prisma.sense.findMany({
      where: { entryId: entry.id },
      select: { id: true, isPreferred: true },
      orderBy: { senseOrder: 'asc' },
    });

    expect(result.errors).toEqual([]);
    expect(result.changesApplied).toBe(2);
    expect(senses).toEqual([
      { id: primary.id, isPreferred: true },
      { id: sibling.id, isPreferred: false },
    ]);
  });

  it('returns zeroed counts when the content directory is missing', async () => {
    const result = await syncContentDirectory(prisma, {
      contentDir: path.join(os.tmpdir(), 'synac-content-does-not-exist-12345'),
    });

    expect(result).toEqual({
      filesScanned: 0,
      filesValid: 0,
      filesInvalid: 0,
      entriesMatched: 0,
      entriesSkipped: 0,
      changesApplied: 0,
      errors: [],
    });
    const users = await prisma.user.count();
    expect(users).toBe(0);
  });
});

describe('parseContentEntryDocument', () => {
  it('rejects a document missing entryType and slug', () => {
    const result = parseContentEntryDocument('senses: []\n', 'bad.yaml');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected validation failure');
    expect(result.errors.join('\n')).toContain('entryType is required');
    expect(result.errors.join('\n')).toContain('slug is required');
    for (const message of result.errors) {
      expect(message.startsWith('bad.yaml: ')).toBe(true);
    }
  });

  it('rejects an unrecognized relationship type', () => {
    const result = parseContentEntryDocument(
      [
        'entryType: TERM',
        'slug: authentication',
        'relationships:',
        '  - type: NOT_A_TYPE',
        '    targetSlug: authorization',
        '    targetEntryType: TERM',
        '',
      ].join('\n'),
      'bad.yaml',
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected validation failure');
    expect(result.errors.join('\n')).toContain(
      'relationships[0].type must be one of',
    );
  });

  it('parses the checked-in example content files', async () => {
    const contentDir = resolveDefaultContentDir();
    const examples = [
      path.join(contentDir, 'entries', 'acronym', 'soc.yaml'),
      path.join(contentDir, 'entries', 'term', 'authentication.yaml'),
    ];

    for (const file of examples) {
      const text = await readFile(file, 'utf8');
      const result = parseContentEntryDocument(text, file);
      if (!result.ok) {
        throw new Error(
          `${file} failed validation: ${result.errors.join('; ')}`,
        );
      }
      expect(result.value.slug.length).toBeGreaterThan(0);
    }
  });
});
