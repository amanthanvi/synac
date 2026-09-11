'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';

import { TypeMarker } from '@/components/ui/TypeMarker';
import styles from '@/app/_styles/Entry.module.css';

type EntryRelationLinkProps = {
  href: string;
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  summary: string | null;
};

/**
 * A plain link plus a disclosure for the summary. The summary is a panel in
 * the flow, not a tooltip: it has to work on touch and from the keyboard.
 */
export function EntryRelationLink({
  href,
  title,
  entryType,
  summary,
}: EntryRelationLinkProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={styles.relationItem}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <div className={styles.relationRow}>
        <Link className={styles.relationLink} href={href}>
          {title}
        </Link>
        <TypeMarker type={entryType} />
        <button
          ref={buttonRef}
          type="button"
          className={styles.relationToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Show summary for ${title}`}
          onClick={() => setOpen((value) => !value)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={styles.icon}
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M12 16.5V11.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M12 8.2h.01"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div id={panelId} className={styles.relationPanel} hidden={!open}>
        {summary?.trim() ? summary.trim() : 'No summary yet.'}
      </div>
    </div>
  );
}
