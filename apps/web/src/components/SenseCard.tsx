'use client';

import { useEffect, useState, type ReactNode } from 'react';

import styles from '@/app/_styles/Entry.module.css';

export const SENSE_OPEN_EVENT = 'synac:sense-open';

export type SenseOpenDetail = {
  senseId: string;
  collapseOthers: boolean;
};

type SenseCardProps = {
  senseId: string;
  /** `sense-<uuid>`; the slug anchor is rendered inside so both fragments work. */
  elementId: string;
  slugAnchorId: string | null;
  senseSlug: string | null;
  label: string;
  needsLabel: boolean;
  expandedForm: string | null;
  excerpt: string;
  defaultOpen: boolean;
  children: ReactNode;
};

/**
 * Owns its own `open` state instead of letting `EntrySenseHashSync` reach in
 * and mutate the DOM attribute React controls. Deep links arrive as a
 * `synac:sense-open` event.
 */
export function SenseCard({
  senseId,
  elementId,
  slugAnchorId,
  senseSlug,
  label,
  needsLabel,
  expandedForm,
  excerpt,
  defaultOpen,
  children,
}: SenseCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    function onOpenSense(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      // `EntrySenseHashSync` is the only dispatcher of this event, and it
      // always attaches a `SenseOpenDetail`.
      const detail = event.detail as SenseOpenDetail | undefined;
      if (!detail) return;

      if (detail.senseId === senseId) {
        setOpen(true);
        return;
      }

      if (detail.collapseOthers) setOpen(false);
    }

    window.addEventListener(SENSE_OPEN_EVENT, onOpenSense);
    return () => window.removeEventListener(SENSE_OPEN_EVENT, onOpenSense);
  }, [senseId]);

  return (
    <details
      id={elementId}
      className={styles.senseCard}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-sense
      data-sense-id={senseId}
      data-slug={senseSlug ?? undefined}
    >
      <summary className={styles.senseSummary}>
        {/* `<summary>` must stay the first child of `<details>`, so the
            `#s-<slug>` anchor lives inside it rather than before it. */}
        {slugAnchorId ? (
          <span id={slugAnchorId} className={styles.senseAnchor} />
        ) : null}
        <div className={styles.senseSummaryTop}>
          <h3 className={styles.senseLabel}>{label}</h3>
          {expandedForm ? (
            <span className={styles.senseExpanded}>{expandedForm}</span>
          ) : null}
          {needsLabel ? (
            <span
              className={styles.senseNeedsLabel}
              title="This sense has no editorial label yet."
            >
              needs label
            </span>
          ) : null}
          <span className={styles.senseChevron} aria-hidden="true">
            ▾
          </span>
        </div>
        <div className={styles.senseExcerpt}>{excerpt}</div>
      </summary>

      <div className={styles.senseContent}>
        <div className={styles.senseContentInner}>{children}</div>
      </div>
    </details>
  );
}
