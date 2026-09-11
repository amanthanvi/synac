'use client';

import Link from 'next/link';

import { TypeBadge } from './TypeBadge';
import { usePopoverDisclosure } from './usePopoverDisclosure';
import styles from './EntryPreviewLink.module.css';

type EntryPreviewLinkProps = {
  href: string;
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  summary?: string | null;
  /** Editorial note explaining the relationship (used by "often confused with"). */
  note?: string | null;
};

/**
 * A link to another entry plus a preview panel. The panel is opened by its own
 * button rather than by hover, so it is reachable by keyboard and on touch; it
 * is real content, never `aria-hidden`.
 */
export function EntryPreviewLink({
  href,
  title,
  entryType,
  summary,
  note,
}: EntryPreviewLinkProps) {
  const { open, panelId, setContainer, setTrigger, toggle } =
    usePopoverDisclosure();
  const summaryText = summary?.trim() ? summary.trim() : 'No summary yet.';

  return (
    <span className={styles.wrap} ref={setContainer}>
      <span className={styles.group}>
        <Link className={styles.link} href={href}>
          {title}
        </Link>
        <button
          type="button"
          ref={setTrigger}
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="srOnly">{`Preview ${title}`}</span>
          <span aria-hidden="true">⌄</span>
        </button>
      </span>

      <span
        className={styles.preview}
        id={panelId}
        role="group"
        aria-label={`Preview of ${title}`}
        hidden={!open}
      >
        <span className={styles.header}>
          <span className={styles.title}>{title}</span>
          <TypeBadge entryType={entryType} />
        </span>
        <span className={styles.summary}>{summaryText}</span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </span>
    </span>
  );
}
