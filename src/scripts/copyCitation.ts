/**
 * Copy citation utilities for term pages.
 * - Attaches click handlers to elements with [data-cite] or [data-cite-all]
 * - Reads data-cite-text and writes to clipboard
 * - Updates nearest [data-cite-live][aria-live="polite"] region with status
 * - CSP-safe: external module, no globals, no inline styles
 */

type CiteElement = HTMLElement & {
  dataset: {
    cite?: string;
    citeAll?: string;
    citeText?: string;
  };
};

function ready(fn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function findLiveRegion(from: Element): HTMLElement | null {
  // Prefer closest section-scoped live region
  const section = from.closest('section');
  if (section) {
    const live = section.querySelector('[data-cite-live][aria-live="polite"]');
    if (live instanceof HTMLElement) return live;
  }
  // Otherwise any global live region
  const global = document.querySelector('[data-cite-live][aria-live="polite"]');
  return global instanceof HTMLElement ? global : null;
}

async function copyModern(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function copyLegacy(text: string): boolean {
  try {
    // Preserve focus to avoid accessibility issues when selecting the textarea
    const activeElement = document.activeElement as HTMLElement | null;

    const ta = document.createElement('textarea');
    ta.value = text;
    // Avoid inline styles; rely on existing sr-only utility to visually hide
    ta.className = 'sr-only';
    ta.setAttribute('readonly', 'true');
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    // Restore focus to previously focused element if possible
    if (activeElement && typeof activeElement.focus === 'function') {
      try {
        activeElement.focus();
      } catch {
        // ignore focus restoration errors
      }
    }
    return ok;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  const sanitized = String(text ?? '').replace(/\r?\n/g, '\n');
  return (await copyModern(sanitized)) || copyLegacy(sanitized);
}

function attachCopyHandler(el: CiteElement) {
  el.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const text = el.dataset.citeText ?? '';
    const live = findLiveRegion(el);
    const ok = await copyText(text);
    if (live) {
      live.textContent = ok ? 'Citation copied.' : 'Copy failed.';
    }
  });
}

ready(() => {
  // Single citation buttons
  const singles = document.querySelectorAll<CiteElement>('[data-cite][data-cite-text]');
  singles.forEach(attachCopyHandler);

  // Multiple (copy all) buttons
  const alls = document.querySelectorAll<CiteElement>('[data-cite-all][data-cite-text]');
  alls.forEach(attachCopyHandler);
});

/**
 * synac-copy-citation Web Component
 * Usage:
 *   <synac-copy-citation text="...">
 *     <button type="button" class="synac-btn">Copy citation</button>
 *   </synac-copy-citation>
 *
 * - Improves isolation and reusability over global selectors
 * - Reuses the same clipboard and live-region logic as data-* handlers
 */
class SynacCopyCitation extends HTMLElement {
  private _text = '';
  private _onClick = (ev: Event) => {
    ev.preventDefault();
    const text = this._text || this.getAttribute('text') || '';
    const live = findLiveRegion(this);
    void copyText(text).then((ok) => {
      if (live) {
        live.textContent = ok ? 'Citation copied.' : 'Copy failed.';
      }
    });
  };

  static get observedAttributes() {
    return ['text'];
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    if (name === 'text' && oldVal !== newVal) {
      this._text = newVal || '';
    }
  }

  connectedCallback() {
    this._text = this.getAttribute('text') || '';
    this.addEventListener('click', this._onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onClick);
  }
}

try {
  if (!customElements.get('synac-copy-citation')) {
    customElements.define('synac-copy-citation', SynacCopyCitation);
  }
} catch {
  // Ignore define errors in non-DOM contexts
}
