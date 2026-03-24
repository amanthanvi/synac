import { describe, expect, it } from 'vitest';

type PublishDeps = {
  getEntry: (entryId: string) => Promise<{
    id: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    summaryMd: string | null;
    publishedAt: Date | null;
  } | null>;
  listSenses: (entryId: string) => Promise<
    Array<{
      id: string;
      definitionMd: string | null;
      definitionText: string | null;
      isEditorial: boolean;
      editorialRationale: string | null;
    }>
  >;
  getSenseProvenanceCounts: (senseIds: string[]) => Promise<Map<string, number>>;
  updateEntry: (input: {
    entryId: string;
    actorUserId: string;
    now: Date;
    publishedAt: Date | null;
  }) => Promise<void>;
  publishSenses: (senseIds: string[], now: Date) => Promise<void>;
  createAuditEvent: (input: {
    actorUserId: string;
    entryId: string;
    action: 'ENTRY_PUBLISH';
  }) => Promise<void>;
  syncAutoTags: (entryId: string) => Promise<void>;
};

async function publishEntryWithDeps(
  deps: PublishDeps,
  input: { actorUserId: string; entryId: string; now: Date },
): Promise<{ publishedSenseCount: number }> {
  const entry = await deps.getEntry(input.entryId);
  if (!entry) throw new Error('Entry not found');
  if (!entry.summaryMd?.trim()) throw new Error('Publishing requires a summary');

  const senses = await deps.listSenses(entry.id);
  const publishable = senses.filter((sense) => Boolean(sense.definitionMd?.trim() || sense.definitionText));
  if (publishable.length === 0) {
    throw new Error('Publishing requires at least one sense with a definition');
  }

  const provenanceCounts = await deps.getSenseProvenanceCounts(publishable.map((sense) => sense.id));
  const publishableWithCitations = publishable.filter((sense) => {
    if (sense.isEditorial && sense.editorialRationale?.trim()) return true;
    return (provenanceCounts.get(sense.id) ?? 0) > 0;
  });

  if (publishableWithCitations.length === 0) {
    throw new Error('Publishing requires citations per sense (or Editorial rationale)');
  }

  await deps.updateEntry({
    entryId: entry.id,
    actorUserId: input.actorUserId,
    now: input.now,
    publishedAt: entry.status === 'PUBLISHED' ? entry.publishedAt : input.now,
  });
  await deps.publishSenses(
    publishableWithCitations.map((sense) => sense.id),
    input.now,
  );
  await deps.syncAutoTags(entry.id);
  await deps.createAuditEvent({
    actorUserId: input.actorUserId,
    entryId: entry.id,
    action: 'ENTRY_PUBLISH',
  });

  return { publishedSenseCount: publishableWithCitations.length };
}

describe('publish entry workflow', () => {
  it('rejects publishing when the entry summary is missing', async () => {
    await expect(
      publishEntryWithDeps(
        {
          getEntry: async () => ({
            id: 'entry-1',
            status: 'DRAFT',
            summaryMd: null,
            publishedAt: null,
          }),
          listSenses: async () => [],
          getSenseProvenanceCounts: async () => new Map(),
          updateEntry: async () => undefined,
          publishSenses: async () => undefined,
          createAuditEvent: async () => undefined,
          syncAutoTags: async () => undefined,
        },
        { actorUserId: 'actor-1', entryId: 'entry-1', now: new Date('2026-03-24T12:00:00.000Z') },
      ),
    ).rejects.toThrow('Publishing requires a summary');
  });

  it('rejects publishing when all publishable senses lack citations and editorial rationale', async () => {
    await expect(
      publishEntryWithDeps(
        {
          getEntry: async () => ({
            id: 'entry-2',
            status: 'DRAFT',
            summaryMd: 'Summary',
            publishedAt: null,
          }),
          listSenses: async () => [
            {
              id: 'sense-1',
              definitionMd: 'Definition',
              definitionText: 'Definition',
              isEditorial: false,
              editorialRationale: null,
            },
          ],
          getSenseProvenanceCounts: async () => new Map([['sense-1', 0]]),
          updateEntry: async () => undefined,
          publishSenses: async () => undefined,
          createAuditEvent: async () => undefined,
          syncAutoTags: async () => undefined,
        },
        { actorUserId: 'actor-1', entryId: 'entry-2', now: new Date('2026-03-24T12:00:00.000Z') },
      ),
    ).rejects.toThrow('Publishing requires citations per sense (or Editorial rationale)');
  });

  it('publishes cited and editorial-rationale senses and syncs auto tags', async () => {
    const updates: Array<string> = [];

    const result = await publishEntryWithDeps(
      {
        getEntry: async () => ({
          id: 'entry-3',
          status: 'DRAFT',
          summaryMd: 'Summary',
          publishedAt: null,
        }),
        listSenses: async () => [
          {
            id: 'sense-1',
            definitionMd: 'Definition',
            definitionText: 'Definition',
            isEditorial: false,
            editorialRationale: null,
          },
          {
            id: 'sense-2',
            definitionMd: 'Editorial definition',
            definitionText: 'Editorial definition',
            isEditorial: true,
            editorialRationale: 'Editor verified',
          },
        ],
        getSenseProvenanceCounts: async () => new Map([['sense-1', 2], ['sense-2', 0]]),
        updateEntry: async () => {
          updates.push('entry');
        },
        publishSenses: async (senseIds) => {
          updates.push(`senses:${senseIds.join(',')}`);
        },
        createAuditEvent: async () => {
          updates.push('audit');
        },
        syncAutoTags: async () => {
          updates.push('auto-tags');
        },
      },
      { actorUserId: 'actor-1', entryId: 'entry-3', now: new Date('2026-03-24T12:00:00.000Z') },
    );

    expect(result).toEqual({ publishedSenseCount: 2 });
    expect(updates).toEqual(['entry', 'senses:sense-1,sense-2', 'auto-tags', 'audit']);
  });
});
