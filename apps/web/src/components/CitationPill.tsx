'use client';

import { usePopoverDisclosure } from './usePopoverDisclosure';
import styles from './CitationPill.module.css';

type CitationPillProps = {
  sourceName: string;
  url: string;
  accessedAtLabel: string;
  documentTitle?: string | null;
  /** Prefer `Source.licensePublicStatement`; falls back to the citation note. */
  licenseStatement?: string | null;
  licenseUrl?: string | null;
  attributionText?: string | null;
  contentModeLabel?: string | null;
  sourceHref?: string | null;
};

/**
 * A source chip that opens a keyboard-reachable panel with the full citation.
 * The URL inside the panel is a real link, so the details are usable without a
 * pointer and on touch devices.
 */
export function CitationPill({
  sourceName,
  url,
  accessedAtLabel,
  documentTitle,
  licenseStatement,
  licenseUrl,
  attributionText,
  contentModeLabel,
  sourceHref,
}: CitationPillProps) {
  const { open, panelId, setContainer, setTrigger, toggle } =
    usePopoverDisclosure();

  return (
    <span className={styles.wrap} ref={setContainer}>
      <button
        type="button"
        ref={setTrigger}
        className={styles.pill}
        data-citation-pill=""
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className={styles.pillText}>{sourceName}</span>
        <span className={styles.pillIcon} aria-hidden="true">
          ⌄
        </span>
      </button>

      <span
        className={styles.popover}
        id={panelId}
        role="group"
        aria-label={`Citation: ${sourceName}`}
        hidden={!open}
      >
        <span className={styles.title}>{sourceName}</span>
        {documentTitle ? (
          <span className={styles.doc}>{documentTitle}</span>
        ) : null}

        <span className={styles.meta}>
          <span>Accessed {accessedAtLabel}</span>
          {contentModeLabel ? <span>{contentModeLabel}</span> : null}
        </span>

        <a
          className={styles.url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {url}
        </a>

        {licenseStatement ? (
          <span className={styles.note}>{licenseStatement}</span>
        ) : null}
        {licenseUrl ? (
          <a
            className={styles.url}
            href={licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            License terms
          </a>
        ) : null}
        {attributionText ? (
          <span className={styles.note}>{attributionText}</span>
        ) : null}

        {sourceHref ? (
          <a className={styles.sourceLink} href={sourceHref}>
            About this source
          </a>
        ) : null}
      </span>
    </span>
  );
}
