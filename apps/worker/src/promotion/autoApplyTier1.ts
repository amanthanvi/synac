import type { PrismaClient } from '@synac/db';

import {
  applyProposedChange,
  ensureSystemActor,
  finalizeIngestItem,
  publishEntryFromIngest,
} from '@synac/db';

import { logger } from '../logger.js';
import { isWarnAutopublishEnabled } from './config.js';

export type AutoApplyResult = {
  applied: number;
  published: number;
  heldForReview: number;
  skipped: number;
  failed: number;
};

/** Why an applied item was held back from auto-publish. */
type HoldReason = 'needs_label' | 'license_gate_warn';

export async function autoApplyTier1IngestItems(
  prod: PrismaClient,
  input: { maxItems: number },
): Promise<AutoApplyResult> {
  const system = await ensureSystemActor(prod);
  const actorUserId = system.id;
  const allowWarnAutopublish = isWarnAutopublishEnabled();

  const candidates = await prod.ingestItem.findMany({
    where: {
      stage: { in: ['VALIDATED', 'REVIEWED'] },
      licenseGate: { in: ['PASS', 'WARN'] },
      error: null,
      ingestRun: {
        status: { in: ['SUCCESS', 'PARTIAL'] },
        source: {
          trustTier: 'TIER_1',
          enabled: true,
          lastVerifiedAt: { not: null },
        },
      },
    },
    select: { id: true },
    orderBy: [{ id: 'asc' }],
    take: Math.max(1, Math.min(100, input.maxItems)),
  });

  let applied = 0;
  let published = 0;
  let heldForReview = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const outcome = await prod.$transaction(async (tx) => {
        const fresh = await tx.ingestItem.findFirst({
          where: { id: candidate.id },
          select: {
            id: true,
            stage: true,
            licenseGate: true,
            ingestRun: {
              select: {
                source: {
                  select: {
                    trustTier: true,
                    enabled: true,
                    lastVerifiedAt: true,
                  },
                },
              },
            },
          },
        });

        if (!fresh) return { kind: 'skipped' as const };
        if (fresh.stage !== 'VALIDATED' && fresh.stage !== 'REVIEWED') {
          return { kind: 'skipped' as const };
        }
        if (fresh.licenseGate === 'FAIL') return { kind: 'skipped' as const };

        const source = fresh.ingestRun.source;
        if (
          !source.enabled ||
          !source.lastVerifiedAt ||
          source.trustTier !== 'TIER_1'
        ) {
          return { kind: 'skipped' as const };
        }

        const result = await applyProposedChange(tx, {
          actorUserId,
          ingestItemId: fresh.id,
          // The publish decision below determines the item's final stage.
          markApplied: false,
        });

        // SPEC FR-107: a newly opened sense that still needs an editor label is
        // a genuine ambiguity on an entry that is already published. Applying
        // the data is fine; publishing over an existing meaning is not.
        const holdReasons: HoldReason[] = [];
        if (
          result.needsLabelSenseIds.length > 0 &&
          result.existingPublishedSenseCount >= 1
        ) {
          holdReasons.push('needs_label');
        }
        if (fresh.licenseGate === 'WARN' && !allowWarnAutopublish) {
          holdReasons.push('license_gate_warn');
        }

        const diff = {
          appliedEntryId: result.entryId,
          appliedSenseIds: result.appliedSenseIds,
          createdSenseIds: result.createdSenseIds,
          attachedSenseIds: result.attachedSenseIds,
          needsLabelSenseIds: result.needsLabelSenseIds,
          autoApplied: true,
        };

        if (holdReasons.length > 0) {
          const reason = holdReasons[0] ?? 'needs_label';
          await finalizeIngestItem(tx, {
            actorUserId,
            ingestItemId: fresh.id,
            stage: 'REVIEWED',
            diff: {
              ...diff,
              autoPublished: false,
              reason,
              reasons: holdReasons,
            },
            auditAction: 'INGEST_ITEM_AUTO_APPLY_HELD',
          });
          return {
            kind: 'held' as const,
            ingestItemId: fresh.id,
            entryId: result.entryId,
            reasons: holdReasons,
          };
        }

        const { publishedSenseCount } = await publishEntryFromIngest(tx, {
          actorUserId,
          entryId: result.entryId,
        });

        await finalizeIngestItem(tx, {
          actorUserId,
          ingestItemId: fresh.id,
          stage: 'APPLIED',
          diff: { ...diff, autoPublished: true, publishedSenseCount },
        });

        return {
          kind: 'published' as const,
          entryId: result.entryId,
          publishedSenseCount,
        };
      });

      if (outcome.kind === 'skipped') {
        skipped += 1;
      } else if (outcome.kind === 'held') {
        applied += 1;
        heldForReview += 1;
        logger.info('autopublish.tier1.held_for_review', {
          ingestItemId: outcome.ingestItemId,
          entryId: outcome.entryId,
          reasons: outcome.reasons,
        });
      } else {
        applied += 1;
        published += 1;
      }
    } catch (err) {
      failed += 1;
      logger.warn('autopublish.item_failed', {
        ingestItemId: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, published, heldForReview, skipped, failed };
}
