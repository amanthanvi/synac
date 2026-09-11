'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './SenseTools.module.css';

type CopyLinkButtonProps = {
  /** Site-relative path plus fragment, e.g. `/term/tls#s-protocol`. */
  path: string;
};

/** Copies the absolute canonical URL for a sense to the clipboard. */
export function CopyLinkButton({ path }: CopyLinkButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function flash(next: 'copied' | 'error') {
    setState(next);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setState('idle'), 2000);
  }

  async function copy() {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      flash('copied');
    } catch {
      flash('error');
    }
  }

  return (
    <span className={styles.copyWrap}>
      <button
        type="button"
        className={styles.toolButton}
        onClick={() => void copy()}
      >
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </button>
      <span className="srOnly" role="status">
        {state === 'copied' ? 'Link copied to clipboard' : ''}
        {state === 'error' ? 'Could not copy the link' : ''}
      </span>
    </span>
  );
}
