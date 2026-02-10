'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  ThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  cycleThemePreference,
  getStoredThemePreference,
  setThemePreference,
} from '@/lib/theme';

import styles from './ThemeToggle.module.css';

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === 'dark') {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20.5 14.5c-1.1.5-2.3.8-3.6.8-4.4 0-8-3.6-8-8 0-1.3.3-2.5.8-3.6-4.1 1-7.2 4.7-7.2 9.1 0 5.2 4.2 9.4 9.4 9.4 4.4 0 8.1-3.1 9.1-7.2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (preference === 'light') {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M19 5l-1.6 1.6M6.6 17.4 5 19M19 19l-1.6-1.6M6.6 6.6 5 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17h10a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 21h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const preference = useSyncExternalStore<ThemePreference>(
    (onStoreChange) => {
      function onStorage(e: StorageEvent) {
        if (e.key !== THEME_STORAGE_KEY) return;
        onStoreChange();
      }

      function onThemeChange() {
        onStoreChange();
      }

      window.addEventListener('storage', onStorage);
      window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      };
    },
    () => getStoredThemePreference(),
    () => 'system'
  );

  const label = useMemo(() => {
    if (preference === 'dark') return 'Theme: Dark';
    if (preference === 'light') return 'Theme: Light';
    return 'Theme: System';
  }, [preference]);

  useEffect(() => {
    applyThemePreference(preference);
  }, [preference]);

  return (
    <button
      className={styles.button}
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        const next = cycleThemePreference(preference);
        setThemePreference(next);
      }}
    >
      <ThemeIcon preference={preference} />
    </button>
  );
}
