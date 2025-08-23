export interface TermEntry {
  id: string; // slug
  term: string; // e.g., "Zero Trust Architecture"
  acronym?: string[]; // ["ZTA"]
  aliases?: string[]; // ["zero-trust", ...]
  summary: string; // concise, human-written overview
  tags: string[]; // ["network", "identity", "nist"]
  sources: Array<{
    kind: 'NIST' | 'RFC' | 'ATTACK' | 'CWE' | 'CAPEC' | 'OTHER';
    citation: string; // e.g., "NIST SP 800-207"
    url: string;
    date?: string; // source pub date
    excerpt?: string; // short quoted/close paraphrase
    normative?: boolean; // normative definition?
  }>;
  mappings?: {
    attack?: { tactic?: string; techniqueIds?: string[] }; // T1059, etc.
    cweIds?: string[];
    capecIds?: string[];
    examDomains?: string[]; // "CISSP Domain 3"
  };
  examples?: Array<{ heading: string; body: string }>;
  seeAlso?: string[]; // other entry ids
  oftenConfusedWith?: string[]; // related ids that are commonly conflated
  updatedAt: string; // ISO
}
