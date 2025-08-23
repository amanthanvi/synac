import MiniSearch from 'minisearch';
import { searchOptions } from '../lib/searchBuild';

// Globals for test coordination
declare global {
  interface Window {
    __synacIndexReady?: boolean;
  }
}

(() => {
  const input = document.getElementById('q') as HTMLInputElement | null;
  const list = document.getElementById('results') as HTMLUListElement | null;
  const count = document.getElementById('count') as HTMLElement | null;

  if (!input || !list || !count) return;

  // Keyboard shortcuts: "/" to focus search, "Escape" to clear/blur
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement as HTMLElement | null;
    const tag = (active && active.tagName) || '';
    const isFormEl = /INPUT|TEXTAREA|SELECT/.test(tag);
    const isContentEditable = !!(active && (active as HTMLElement).isContentEditable);
    const isReadOnly = !!(active && 'readOnly' in (active as any) && (active as any).readOnly);
    const isDisabled = !!(active && 'disabled' in (active as any) && (active as any).disabled);
    // Only treat as editing if it's a form element AND not readOnly/disabled, or if it's contentEditable
    const isEditing = (isFormEl && !isReadOnly && !isDisabled) || isContentEditable;

    if (e.key === '/' && !isEditing) {
      e.preventDefault();
      input.focus();
    } else if (e.key === 'Escape' && document.activeElement === input) {
      input.value = '';
      render([]);
      input.blur();
    }
  });

  let mini: MiniSearch | null = null;
  // Will be replaced by payload.options.searchOptions if present
  let currentSearchOptions: any = searchOptions.searchOptions;

  const render = (items: any[]) => {
    list!.innerHTML = '';
    count!.textContent = items.length
      ? `${items.length} result${items.length === 1 ? '' : 's'}`
      : '';
    for (const it of items.slice(0, 50)) {
      const li = document.createElement('li');
      li.style.cssText = 'padding:.6rem .75rem; border:1px solid #2a2e35; border-radius:8px;';
      li.setAttribute('role', 'listitem');
      const a = document.createElement('a');
      a.href = `/terms/${it.id}`;
      a.style.cssText =
        'display:block; min-height:44px; padding:.75rem .75rem; color:inherit; text-decoration:none;';
      const title = document.createElement('div');
      title.style.cssText = 'display:flex; align-items:center; gap:.5rem;';
      const strong = document.createElement('strong');
      strong.textContent = String(it.term || '');
      title.appendChild(strong);
      if (Array.isArray(it.acronym) && it.acronym.length) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = it.acronym.join(', ');
        title.appendChild(badge);
      }
      if (Array.isArray(it.sourceKinds) && it.sourceKinds.length) {
        for (const k of it.sourceKinds) {
          const kind = document.createElement('span');
          kind.className = 'kind';
          kind.textContent = String(k || '');
          title.appendChild(kind);
        }
      }
      const meta = document.createElement('div');
      meta.style.cssText = 'color:var(--color-muted); font-size:.9em; margin-top:.25rem;';
      if (Array.isArray(it.tags) && it.tags.length)
        meta.textContent = it.tags.map((t: string) => `#${t}`).join(' ');
      a.appendChild(title);
      a.appendChild(meta);
      li.appendChild(a);
      list!.appendChild(li);
    }
  };

  const buildFromDomFallback = async (): Promise<MiniSearch | null> => {
    const anchors = Array.from(
      document.querySelectorAll('a[href^="/terms/"]'),
    ) as HTMLAnchorElement[];
    const docs = anchors
      .map((a) => {
        const href = a.getAttribute('href') || '';
        const id = href.split('/').pop() || '';
        const term = (a.textContent || '').trim();
        return { id, term, text: term, tags: [] as string[], sourceKinds: [] as string[] };
      })
      .filter((d) => d.id && d.term);
    if (!docs.length) return null;
    const m = new MiniSearch(searchOptions as any);
    m.addAll(docs as any);
    try {
      if (count) {
        count.setAttribute('data-mode', 'fallback');
        count.title = 'Limited search index (DOM fallback)';
      }
    } catch {}
    return m;
  };

  const ensureIndex = async (): Promise<MiniSearch | null> => {
    if (mini) return mini;
    try {
      const res = await fetch('/search.json', { credentials: 'same-origin' });
      if (!res.ok) {
        // DOM fallback when payload is unavailable
        const m = await buildFromDomFallback();
        if (m) {
          mini = m;
          try {
            window.__synacIndexReady = true;
          } catch {}
          return mini;
        }
        return null;
      }
      const payload = await res.json();
      // Try revive fast path
      try {
        const indexObj =
          typeof payload.index === 'string' ? JSON.parse(payload.index) : payload.index;
        mini = MiniSearch.loadJSON(indexObj, payload.options);
      } catch (err) {
        try {
          console.error('Failed to revive MiniSearch index:', err);
        } catch {}
<<<<<<< HEAD
        // Fallback to rebuilding from payload.docs using provided options or default searchOptions
        const opts = payload.options || (searchOptions as any);
        const m = new MiniSearch(opts);
        if (Array.isArray(payload.docs)) {
          m.addAll(payload.docs);
        }
        mini = m;
=======
        // Fallback to rebuilding from payload.docs using provided options or default searchOptions.
        // If docs are not present (production payload optimization), attempt DOM fallback.
        const opts = payload.options || (searchOptions as any);
        const rebuilt = new MiniSearch(opts);
        if (Array.isArray(payload.docs) && payload.docs.length) {
          rebuilt.addAll(payload.docs);
          mini = rebuilt;
        } else {
          const domFallback = await buildFromDomFallback();
          mini = domFallback || rebuilt; // rebuilt may be empty but preserves options
        }
>>>>>>> 3597186 (merge: resolve conflicts\n\n- Keep builder-based search.json (buildIndexPayload, no docs in payload)\n- Keep extracted client search script (safe DOM, fallbacks, shared searchOptions)\n- Keep offline E2E with documentation and default skip for CI determinism)
      }
      currentSearchOptions =
        (payload.options && payload.options.searchOptions) || currentSearchOptions;
      try {
        window.__synacIndexReady = true;
      } catch {}
      return mini;
    } catch {
      // Network error -> try DOM fallback
      const m = await buildFromDomFallback();
      if (m) {
        mini = m;
        try {
          window.__synacIndexReady = true;
        } catch {}
        return mini;
      }
      return null;
    }
  };

  const onInput = async () => {
    const q = input!.value.trim();
    const m = await ensureIndex();
    if (!m) return;
    if (!q) {
      render([]);
      return;
    }
    const results = m.search(q, currentSearchOptions);
    render(results);
  };

  input.addEventListener('input', () => {
    queueMicrotask(onInput);
  });

  // Warm index in background
  ensureIndex().catch(() => {});
})();
