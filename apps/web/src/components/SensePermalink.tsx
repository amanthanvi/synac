'use client';

import { useEffect, useRef, useState } from 'react';

import styles from '@/app/_styles/Entry.module.css';

const CLEAR_AFTER_MS = 4000;

/** Copies the absolute sense URL; the value is passed in, never read off window. */
export function SensePermalink({ url }: { url: string }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function announce(text: string) {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), CLEAR_AFTER_MS);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      announce('Link copied');
    } catch {
      announce('Could not copy the link');
    }
  }

  return (
    <span className={styles.senseCopyWrap}>
      <button
        type="button"
        className={styles.senseCopy}
        aria-label="Copy link to this sense"
        onClick={copy}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={styles.icon}
        >
          <path
            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span role="status" aria-live="polite" className={styles.senseCopyStatus}>
        {message}
      </span>
    </span>
  );
}
