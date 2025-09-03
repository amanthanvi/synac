#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

function isoMidnightUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00.000Z`;
}
const UPDATED_AT = isoMidnightUTC();

function ensureFile(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const dir = path.dirname(p);
  const base = path.basename(p);
  const temp = path.join(dir, `.${base}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let tempCreated = false;
  try {
    fs.writeFileSync(temp, c);
    tempCreated = true;
    fs.renameSync(temp, p);
  } catch (err) {
    if (tempCreated && fs.existsSync(temp)) {
      try {
        fs.unlinkSync(temp);
      } catch {}
    }
    throw err;
  }
}

/** deprecated: escaping handled by YAML serializer */

function frontmatter(entry) {
  const { id, term, summary, tags, sources, mappings } = entry;
  const doc = {
    id,
    term,
    summary,
    tags: Array.isArray(tags) ? tags : [],
    sources: Array.isArray(sources) ? sources : [],
    updatedAt: UPDATED_AT,
  };
  if (mappings && Object.keys(mappings).length) {
    doc.mappings = mappings;
  }
  const yaml = YAML.stringify(doc).trimEnd();
  return ['---', yaml, '---'].join('\n');
}

function mdx(entry) {
  return frontmatter(entry) + '\n' + (entry.body || '') + '\n';
}

const ALLOWED_SOURCE_KINDS = new Set(['NIST', 'RFC', 'ATTACK', 'CWE', 'CAPEC', 'OTHER']);
const ALLOWED_MAPPING_KEYS = new Set(['attack', 'cweIds', 'capecIds', 'examDomains']);

function validateEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('foundation-terms.json must be an array');
  }
  const seen = new Set();
  for (const [i, e] of entries.entries()) {
    const ctx = `entry[${i}] id=${e?.id ?? '<missing>'}`;
    if (!e || typeof e !== 'object') throw new Error(`${ctx}: must be object`);
    if (!e.id || typeof e.id !== 'string') throw new Error(`${ctx}: missing id`);
    if (seen.has(e.id)) throw new Error(`${ctx}: duplicate id '${e.id}'`);
    seen.add(e.id);
    if (!e.term || typeof e.term !== 'string') throw new Error(`${ctx}: missing term`);
    if (!e.summary || typeof e.summary !== 'string') throw new Error(`${ctx}: missing summary`);
    if (e.summary.length > 240) throw new Error(`${ctx}: summary > 240 chars`);
    if (!Array.isArray(e.tags)) throw new Error(`${ctx}: tags must be array`);
    if (!e.tags.every(tag => typeof tag === 'string')) {
      throw new Error(`${ctx}: all tags must be strings`);
    }
    if (!Array.isArray(e.sources) || e.sources.length < 1 || e.sources.length > 3) {
      throw new Error(`${ctx}: sources must have 1-3 items`);
    }
    for (const [j, s] of (e.sources || []).entries()) {
      const sctx = `${ctx}.sources[${j}]`;
      if (!s || typeof s !== 'object') throw new Error(`${sctx}: must be object`);
      if (!s.kind || typeof s.kind !== 'string') throw new Error(`${sctx}: missing kind`);
      if (!ALLOWED_SOURCE_KINDS.has(s.kind))
        throw new Error(
          `${sctx}: kind '${s.kind}' not in ${Array.from(ALLOWED_SOURCE_KINDS).join(',')}`,
        );
      if (!s.citation || typeof s.citation !== 'string')
        throw new Error(`${sctx}: missing citation`);
      if (!s.url || typeof s.url !== 'string') throw new Error(`${sctx}: missing url`);
    }
    if (e.mappings && typeof e.mappings === 'object') {
      for (const k of Object.keys(e.mappings)) {
        if (!ALLOWED_MAPPING_KEYS.has(k))
          throw new Error(`${ctx}: unsupported mappings key '${k}'`);
      }
      if (e.mappings.attack) {
        const a = e.mappings.attack;
        if (a.techniqueIds && !Array.isArray(a.techniqueIds))
          throw new Error(`${ctx}: attack.techniqueIds must be array if present`);
      }
    }
  }
}

function loadFoundationTerms(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${jsonPath}: ${(e && e.message) || e}`);
  }
  validateEntries(data);
  return data;
}

const JSON_PATH = path.join('data', 'foundation-terms.json');
const entries = loadFoundationTerms(JSON_PATH);

entries.sort((a, b) => {
  const termCompare = a.term.localeCompare(b.term);
  if (termCompare !== 0) return termCompare;
  return a.id.localeCompare(b.id);
});

for (const e of entries) {
  const outPath = path.join('src/content/terms', `${e.id}.mdx`);
  ensureFile(outPath, mdx(e));
}

console.log(`Wrote ${entries.length} terms.`);
