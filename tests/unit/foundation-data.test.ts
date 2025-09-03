import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Source = {
  kind: string;
  citation: string;
  url: string;
  normative?: boolean;
  date?: string;
  excerpt?: string;
};

type AttackMapping = {
  tactic?: string;
  techniqueIds?: string[];
};

type Mappings = {
  attack?: AttackMapping;
  cweIds?: string[];
  capecIds?: string[];
  examDomains?: string[];
};

type Entry = {
  id: string;
  term: string;
  summary: string;
  tags: string[];
  sources: Source[];
  mappings?: Mappings;
  body?: string;
};

const ALLOWED_SOURCE_KINDS = new Set(['NIST', 'RFC', 'ATTACK', 'CWE', 'CAPEC', 'OTHER']);
const ALLOWED_MAPPING_KEYS = new Set(['attack', 'cweIds', 'capecIds', 'examDomains']);

function load(): Entry[] {
  const p = path.join(process.cwd(), 'data', 'foundation-terms.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as Entry[];
}

describe('foundation-terms.json integrity', () => {
  const items = load();

  it('has unique ids and required fields', () => {
    const seen = new Set<string>();
    for (const e of items) {
      expect(typeof e).toBe('object');
      expect(typeof e.id).toBe('string');
      expect(e.id.length).toBeGreaterThan(0);
      expect(seen.has(e.id)).toBeFalsy();
      seen.add(e.id);

      expect(typeof e.term).toBe('string');
      expect(e.term.length).toBeGreaterThan(0);

      expect(typeof e.summary).toBe('string');
      expect(e.summary.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeLessThanOrEqual(240);

      expect(Array.isArray(e.tags)).toBe(true);

      expect(Array.isArray(e.sources)).toBe(true);
      expect(e.sources.length).toBeGreaterThanOrEqual(1);
      expect(e.sources.length).toBeLessThanOrEqual(3);

      for (const s of e.sources) {
        expect(typeof s.kind).toBe('string');
        expect(ALLOWED_SOURCE_KINDS.has(s.kind)).toBeTruthy();
        expect(typeof s.citation).toBe('string');
        expect(s.citation.length).toBeGreaterThan(0);
        expect(typeof s.url).toBe('string');
        expect(s.url.length).toBeGreaterThan(0);
        if (s.normative !== undefined) {
          expect(typeof s.normative).toBe('boolean');
        }
      }

      if (e.mappings && typeof e.mappings === 'object') {
        const keys = Object.keys(e.mappings);
        for (const k of keys) {
          expect(ALLOWED_MAPPING_KEYS.has(k)).toBeTruthy();
        }
        if (e.mappings.attack) {
          const a = e.mappings.attack;
          if (a.techniqueIds !== undefined) {
            expect(Array.isArray(a.techniqueIds)).toBe(true);
          }
        }
        if (e.mappings.cweIds !== undefined) {
          expect(Array.isArray(e.mappings.cweIds)).toBe(true);
        }
        if (e.mappings.capecIds !== undefined) {
          expect(Array.isArray(e.mappings.capecIds)).toBe(true);
        }
        if (e.mappings.examDomains !== undefined) {
          expect(Array.isArray(e.mappings.examDomains)).toBe(true);
        }
      }
    }
  });
});
