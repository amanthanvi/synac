import MiniSearch from 'minisearch';
import { searchOptions } from '../lib/searchOptions';
import { ENABLE_TELEMETRY } from '../lib/constants';
import { normalizeQuery, normalizeTokens } from '../lib/tokenize';
import { applyFacetFilters as filterShared, type FacetSelections } from '../lib/facetFilter';
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

  // Facet containers
  const sourceFilters = document.getElementById('filters') as HTMLDivElement | null; // Sources
  const typeFilters = document.getElementById('type-filters') as HTMLDivElement | null; // Types
  const tagFilters = document.getElementById('tag-filters') as HTMLDivElement | null; // Tags (chips, dynamic)

  if (!input || !list || !count) return;

  // Supported facet values (stable)
  const SUPPORTED_SOURCES = new Set(['NIST', 'ATTACK', 'CWE', 'CAPEC', 'RFC']);
  const SUPPORTED_TYPES = new Set([
    'protocol',
    'vulnerability',
    'attack-pattern',
    'crypto',
    'identity',
    'concept',
  ]);

  // Current selections
  let selectedSources = new Set<string>();
  let selectedTypes = new Set<string>();
  let selectedTags = new Set<string>();

  // Keyboard shortcuts: "/" to focus search, "Escape" to clear/blur
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement as HTMLElement | null;
    const tag = (active && active.tagName) || '';
    const isFormEl = /INPUT|TEXTAREA|SELECT/.test(tag);
    const isContentEditable = !!(active && (active as HTMLElement).isContentEditable);
    const isReadOnly = !!(active && 'readOnly' in (active as any) && (active as any).readOnly);
    const isDisabled = !!(active && 'disabled' in (active as any) && (active as any).disabled);
    const isEditing = (isFormEl && !isReadOnly && !isDisabled) || isContentEditable;

    if (e.key === '/' && !isEditing) {
      e.preventDefault();
      input.focus();
    } else if (e.key === 'Escape' && document.activeElement === input) {
      input.value = '';
      updateUrlFromState();
      render([]);
      input.blur();
    }
  });

  let mini: MiniSearch | null = null;
  // Will be replaced by payload.options.searchOptions if present
  let currentSearchOptions: any = searchOptions.searchOptions;
  let availableTags: string[] = [];

  const escapeHtml = (s: string) => {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const escapeRegex = (s: string) => {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const highlight = (text: string, terms: string[]) => {
    if (!terms || !terms.length) return escapeHtml(String(text || ''));
    let html = escapeHtml(String(text || ''));
    for (const t of terms) {
      const token = t.trim();
      if (!token) continue;
      const re = new RegExp(`(${escapeRegex(token)})`, 'ig');
      html = html.replace(re, '<mark>$1</mark>');
    }
    return html;
  };

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

      // Alias badge (non-intrusive)
      if (it.matchedViaAlias) {
        const ab = document.createElement('span');
        ab.className = 'badge';
        ab.textContent = 'Alias match';
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = ' (matched via alias)';
        ab.appendChild(sr);
        title.appendChild(ab);
      }

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
      if (Array.isArray(it.tags) && it.tags.length) {
        meta.textContent = it.tags.map((t: string) => `#${t}`).join(' ');
      }

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

  const parseUrlState = () => {
    const usp = new URLSearchParams(location.search);
    const q = usp.get('q') || '';
    const splitCsv = (v: string | null) =>
      (v ? v.split(',') : []).map((s) => s.trim()).filter(Boolean);
    const sources = splitCsv(usp.get('sources'))
      .map((s) => s.toUpperCase())
      .filter((s) => SUPPORTED_SOURCES.has(s));
    const types = splitCsv(usp.get('types')).filter((t) => SUPPORTED_TYPES.has(t));
    const tags = splitCsv(usp.get('tags'));
    return { q, sources, types, tags };
  };

  const updateUrlFromState = (push = false) => {
    const usp = new URLSearchParams(location.search);
    // Preserve unknown params by deleting only known keys
    for (const k of ['q', 'sources', 'types', 'tags']) usp.delete(k);

    const q = input!.value.trim();
    if (q) usp.set('q', q);
    if (selectedSources.size) usp.set('sources', Array.from(selectedSources).join(','));
    if (selectedTypes.size) usp.set('types', Array.from(selectedTypes).join(','));
    if (selectedTags.size) usp.set('tags', Array.from(selectedTags).join(','));

    const newUrl = `${location.pathname}?${usp.toString()}${location.hash || ''}`;
    if (push) {
      history.pushState(null, '', newUrl);
    } else {
      history.replaceState(null, '', newUrl);
    }
  };

  const syncUiFromState = () => {
    const st = parseUrlState();
    input!.value = st.q;
    selectedSources = new Set(st.sources);
    selectedTypes = new Set(st.types);
    selectedTags = new Set(st.tags);

    // sync source chips aria-pressed
    if (sourceFilters) {
      const buttons = Array.from(
        sourceFilters.querySelectorAll('button[data-kind]'),
      ) as HTMLButtonElement[];
      for (const btn of buttons) {
        const kind = btn.getAttribute('data-kind') || '';
        const on = selectedSources.has(kind);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('btn-chip--active', on);
      }
    }
    // sync type chips
    if (typeFilters) {
      const buttons = Array.from(
        typeFilters.querySelectorAll('button[data-type]'),
      ) as HTMLButtonElement[];
      for (const btn of buttons) {
        const t = btn.getAttribute('data-type') || '';
        const on = selectedTypes.has(t);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('btn-chip--active', on);
      }
    }
    // sync tags (if rendered already)
    if (tagFilters) {
      const buttons = Array.from(
        tagFilters.querySelectorAll('button[data-tag]'),
      ) as HTMLButtonElement[];
      for (const btn of buttons) {
        const t = btn.getAttribute('data-tag') || '';
        const on = selectedTags.has(t);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('btn-chip--active', on);
      }
    }
  };

  const renderTagChips = () => {
    if (!tagFilters) return;
    tagFilters.innerHTML = '';
    if (!availableTags || !availableTags.length) return;
    const frag = document.createDocumentFragment();
    for (const tag of availableTags) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-chip';
      b.setAttribute('data-tag', tag);
      b.setAttribute('aria-pressed', selectedTags.has(tag) ? 'true' : 'false');
      b.textContent = `#${tag}`;
      if (selectedTags.has(tag)) b.classList.add('btn-chip--active');
      frag.appendChild(b);
    }
    tagFilters.appendChild(frag);
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

      // tags meta for rendering tag chips
      if (Array.isArray(payload.tags)) {
        availableTags = payload.tags.slice(0, 300); // keep UI manageable
        renderTagChips();
      }

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

  const decorateAndFilter = (results: any[], qTokens: string[]): any[] => {
    const decorated = results.map((r: any) => {
      const aliasTokens: string[] = Array.isArray(r.aliasTokens) ? r.aliasTokens : [];
      const aliasHit = aliasTokens.length ? aliasTokens.some((t) => qTokens.includes(t)) : false;
      const idHit = normalizeTokens(String(r.id || '')).some((t) => qTokens.includes(t));
      const titleHit = normalizeTokens(String(r.term || '')).some((t) => qTokens.includes(t));
      const matchedViaAlias = !!(aliasHit && !(idHit || titleHit));
      return { ...r, matchedViaAlias };
    });
    const sel: FacetSelections = {
      sources: Array.from(selectedSources),
      types: Array.from(selectedTypes),
      tags: Array.from(selectedTags),
    };
    return filterShared(decorated, sel) as any[];
  };

  const onInput = async () => {
    const q = input!.value.trim();
    const m = await ensureIndex();
    if (!m) return;
    if (!q) {
      updateUrlFromState();
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
    const qTokens = normalizeQuery(q);
    // In DOM fallback mode, docs do not contain facets; bypass filtering
    const isFallback = !!(
      count &&
      (count as HTMLElement).dataset &&
      (count as HTMLElement).dataset.mode === 'fallback'
    );
    const filtered = isFallback ? results : decorateAndFilter(results, qTokens);
    render(filtered, qTokens);
  };

  // Input change -> update URL and search (debounced)
  let __typingTimer: number | undefined;
  input.addEventListener('input', () => {
    if (__typingTimer) window.clearTimeout(__typingTimer);
    __typingTimer = window.setTimeout(() => {
      updateUrlFromState();
      void onInput();
    }, 120) as unknown as number;
  });

  // Source facet toggles
  // Generic chip toggle wiring to reduce duplication
  const wireChipToggle = (
    container: HTMLDivElement | null,
    attr: 'data-kind' | 'data-type' | 'data-tag',
    selected: Set<string>,
  ) => {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest(
        `button[${attr}]`,
      ) as HTMLButtonElement | null;
      if (!target) return;
      const val = target.getAttribute(attr);
      if (!val) return;
      const next = target.getAttribute('aria-pressed') !== 'true';
      target.setAttribute('aria-pressed', next ? 'true' : 'false');
      target.classList.toggle('btn-chip--active', next);
      if (next) selected.add(val);
      else selected.delete(val);
      updateUrlFromState();
      queueMicrotask(onInput);
    });
  };

  // Wire all chip groups
  wireChipToggle(sourceFilters, 'data-kind', selectedSources);
  wireChipToggle(typeFilters, 'data-type', selectedTypes);
  wireChipToggle(tagFilters, 'data-tag', selectedTags);

  // Also attach direct listeners to static chips (robust inside <details>)
  document.querySelectorAll('button[data-kind]').forEach((el) => {
    const btn = el as HTMLButtonElement;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const val = btn.getAttribute('data-kind');
      if (!val) return;
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      btn.classList.toggle('btn-chip--active', next);
      if (next) selectedSources.add(val);
      else selectedSources.delete(val);
      updateUrlFromState();
      queueMicrotask(onInput);
    });
  });

  document.querySelectorAll('button[data-type]').forEach((el) => {
    const btn = el as HTMLButtonElement;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const val = btn.getAttribute('data-type');
      if (!val) return;
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      btn.classList.toggle('btn-chip--active', next);
      if (next) selectedTypes.add(val);
      else selectedTypes.delete(val);
      updateUrlFromState();
      queueMicrotask(onInput);
    });
  });
  // Type facet toggles

  // Tag facet toggles

  // Support back/forward navigation to update UI and rerun queries
  window.addEventListener('popstate', () => {
    syncUiFromState();
    void onInput();
  });

  // Initialize from URL, warm index and render tags (if available in payload)
  syncUiFromState();
  ensureIndex()
    .then(() => {
      renderTagChips();
      syncUiFromState();
      if (input!.value.trim()) void onInput();
      try {
        window.__synacIndexReady = true;
      } catch {}
    })
    .catch(() => {});
})();
