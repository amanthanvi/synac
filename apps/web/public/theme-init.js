/*
 * Applies the stored theme before first paint, so a dark-mode visitor never
 * sees a flash of the light palette.
 *
 * This lives in a static file rather than an inline <script> so it is covered
 * by `script-src 'self'` and needs no CSP nonce. Keep the storage key in sync
 * with THEME_STORAGE_KEY in src/lib/theme.ts.
 */
(function () {
  try {
    var stored = window.localStorage.getItem('synac-theme');
    var root = document.documentElement;
    if (stored === 'dark' || stored === 'light') {
      root.setAttribute('data-theme', stored);
    } else {
      root.removeAttribute('data-theme');
    }
  } catch (error) {
    void error;
    document.documentElement.removeAttribute('data-theme');
  }
})();
