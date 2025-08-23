import MiniSearch from 'minisearch';
import { searchOptions } from '../lib/searchBuild';
import { ENABLE_TELEMETRY } from '../lib/constants';
declare const __BUILD_TIME__: string | number;

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
  const filters = document.getElementById('filters') as HTMLDivElement | null;
  const activeKinds = new Set<string>();

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

  function escapeHtml(s: string) {
    return String(s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlight(text: string, terms: string[]) {
    if (!terms || !terms.length) return escapeHtml(String(text || ''));
    let html = escapeHtml(String(text || ''));
    for (const t of terms) {
      const token = t.trim();
      if (!token) continue;
      const re = new RegExp(`(${escapeRegex(token)})`, 'ig');
      html = html.replace(re, '<mark>$1</mark>');
    }
    return html;
  }

  const render = (items: any[], tokens: string[] = []) => {
    list!.innerHTML = '';
    if (items.length) {
      count!.textContent = `${items.length} result${items.length === 1 ? '' : 's'}`;
    } else {
      count!.textContent = tokens.length ? 'No results' : '';
    }
    for (const it of items.slice(0, 50)) {
      const li = document.createElement('li');
      li.className = 'result-item';
      li.setAttribute('role', 'listitem');
      const a = document.createElement('a');
      a.href = `/terms/${it.id}`;
      a.className = 'result-link';
      const title = document.createElement('div');
      title.className = 'result-title';
      const strong = document.createElement('strong');
      strong.innerHTML = highlight(String(it.term || ''), tokens);
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
      meta.className = 'result-meta';
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
        // Include slug in text/tags so queries like "xss" match even in DOM fallback mode
        return { id, term, text: `${term} ${id}`, tags: [id], sourceKinds: [] as string[] };
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
      const res = await fetch(`/search.json?v=${__BUILD_TIME__}`, { credentials: 'same-origin' });
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
        const indexJson =
          typeof payload.index === 'string' ? payload.index : JSON.stringify(payload.index);
        mini = MiniSearch.loadJSON(indexJson, payload.options);
      } catch (err) {
        try {
          console.error('Failed to revive MiniSearch index:', err);
        } catch {}
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
      render([], []);
      return;
    }
    const results = m.search(q, currentSearchOptions);
    // When telemetry is enabled, log zero-result queries in a privacy-preserving way
    if (ENABLE_TELEMETRY && results.length === 0) {
      try {
        const payload = JSON.stringify({ q, ts: Date.now() });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/log-search', blob);
        } else {
          fetch('/api/log-search', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
    }
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    // In DOM fallback mode, docs do not contain sourceKinds; bypass kind filtering
    const isFallback = !!(
      count &&
      (count as HTMLElement).dataset &&
      (count as HTMLElement).dataset.mode === 'fallback'
    );
    const filtered =
      activeKinds.size && !isFallback
        ? results.filter(
            (r: any) =>
              Array.isArray(r.sourceKinds) &&
              r.sourceKinds.some((k: string) => activeKinds.has(String(k))),
          )
        : results;
    render(filtered, tokens);
  };

  input.addEventListener('input', () => {
    // Flush microtasks, then schedule after a paint to ensure DOM is ready before assertions
    queueMicrotask(() => requestAnimationFrame(() => onInput()));
  });

  if (filters) {
    filters.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest(
        'button[data-kind]',
      ) as HTMLButtonElement | null;
      if (!target) return;
      const kind = target.getAttribute('data-kind');
      if (!kind) return;
      if (activeKinds.has(kind)) {
        activeKinds.delete(kind);
        target.setAttribute('aria-pressed', 'false');
        target.classList.remove('btn-chip--active');
      } else {
        activeKinds.add(kind);
        target.setAttribute('aria-pressed', 'true');
        target.classList.add('btn-chip--active');
      }
      // Re-run search with current query (may be empty)
      queueMicrotask(onInput);
    });
  }

  // Warm index in background
  ensureIndex().catch(() => {});
})();
