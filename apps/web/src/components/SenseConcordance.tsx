import { formatDate } from '@/lib/publicFormat';
import {
  formatContentMode,
  formatTrustTierShort,
  trustTierRank,
} from '@/lib/publicLabels';
import type { SenseAttestation } from '@/lib/publicEntryPage';
import { diffWords } from '@/lib/textDiff';

import styles from './SenseConcordance.module.css';

/**
 * Side-by-side definitions when a sense is attested by more than one source.
 *
 * The primary attestation is the baseline; every other column highlights the
 * words it adds, so a reader can see at a glance where sources diverge.
 */
export function SenseConcordance({
  attestations,
}: {
  attestations: SenseAttestation[];
}) {
  if (attestations.length < 2) return null;

  const primary =
    attestations.find((item) => item.isPrimary) ?? attestations[0];
  if (!primary) return null;

  const ordered = [primary, ...attestations.filter((item) => item !== primary)];

  return (
    <section className={styles.wrap} aria-label="Definitions by source">
      <h4 className={styles.title}>
        Definitions from {attestations.length} sources
      </h4>
      <p className={styles.legend}>
        Compared against <strong>{primary.citation.source.name}</strong>.
        Highlighted words appear only in that column.
      </p>

      <div className={styles.grid}>
        {ordered.map((attestation) => {
          const isPrimary = attestation === primary;
          const segments = isPrimary
            ? [{ kind: 'same' as const, text: attestation.definitionText }]
            : diffWords(primary.definitionText, attestation.definitionText);

          return (
            <article key={attestation.id} className={styles.column}>
              <header className={styles.columnHeader}>
                <a
                  className={styles.sourceName}
                  href={`/sources/${attestation.citation.source.sourceSlug}`}
                >
                  {attestation.citation.source.name}
                </a>
                <span
                  className={`${styles.tier} ${
                    trustTierRank(attestation.citation.source.trustTier) <= 1
                      ? styles.tierTop
                      : ''
                  }`}
                  title="Source trust tier. Tier 1 is the most authoritative."
                >
                  {formatTrustTierShort(attestation.citation.source.trustTier)}
                </span>
              </header>

              <div className={styles.columnMeta}>
                <span>{formatContentMode(attestation.contentMode)}</span>
                <span>
                  Accessed {formatDate(attestation.citation.accessedAt)}
                </span>
                {isPrimary ? (
                  <span className={styles.primaryFlag}>Primary</span>
                ) : null}
              </div>

              <p className={styles.definition}>
                {segments.map((segment, index) =>
                  segment.kind === 'added' ? (
                    <mark key={index}>{segment.text}</mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
