export type ThemePreference = 'system' | 'dark' | 'light';

export const THEME_CHANGE_EVENT = 'synac-theme-change' as const;
export const THEME_STORAGE_KEY = 'synac-theme' as const;

export function parseThemePreference(value: unknown): ThemePreference | null {
  if (value === 'system' || value === 'dark' || value === 'light') return value;
  return null;
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';

  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (preference === 'dark' || preference === 'light') {
    root.setAttribute('data-theme', preference);
    return;
  }

  root.removeAttribute('data-theme');
}

export function setThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc).
  }

  applyThemePreference(preference);

  try {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  } catch {
    // Ignore dispatch failures (very old browsers).
  }
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'dark';
  if (current === 'dark') return 'light';
  return 'system';
}
