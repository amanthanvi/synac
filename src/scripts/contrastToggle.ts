export {};

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const btn = document.getElementById('contrast-toggle') as HTMLButtonElement | null;
  if (!btn) return;

  const apply = (on: boolean) => {
    if (on) {
      root.setAttribute('data-contrast', 'high');
    } else {
      root.removeAttribute('data-contrast');
    }
  };

  let initial = false;
  try {
    initial = localStorage.getItem('synac-contrast') === 'high';
  } catch {
    initial = false;
  }

  apply(initial);
  btn.setAttribute('aria-pressed', initial ? 'true' : 'false');

  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-contrast') !== 'high';
    apply(next);
    try {
      localStorage.setItem('synac-contrast', next ? 'high' : '');
    } catch {
      /* ignore */
    }
    btn.setAttribute('aria-pressed', next ? 'true' : 'false');
  });
});