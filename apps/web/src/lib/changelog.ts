export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: '2026-01-09',
    title: 'Work in progress',
    items: [],
  },
  {
    version: 'v0.1.4',
    date: '2026-01-09',
    title: 'Reference Atlas UX refinements',
    items: [
      'Single global header search with `/` focus shortcut.',
      'Command palette (`⌘K` / `Ctrl+K`) for navigation + quick search.',
      'Browse + search listings tightened for faster scanning.',
      'Entry pages: high-sense accordion + hash-to-sense opening behavior.',
      'Admin UI consistency pass for key workflows (entries, ingest review, audit, takedown).',
    ],
  },
  {
    version: 'v0.1.3',
    date: '2026-01-06',
    title: 'Field manual UI overhaul',
    items: [
      'Default light “field manual” theme with automatic dark mode.',
      'Entry pages: at-a-glance rail, sense TOC, footnote-style references.',
      'Explore dropdown navigation and refreshed home page.',
    ],
  },
  {
    version: 'v0.1.2',
    date: '2026-01-06',
    title: 'Tier‑1 source expansion',
    items: [
      'Added IETF RFC 4949 Internet Security Glossary ingestion (Tier‑1 source).',
      'Seeded additional MITRE ATT&CK CTI sources (Mobile + ICS).',
    ],
  },
  {
    version: 'v0.1.1',
    date: '2026-01-06',
    title: 'Branding polish + NICCS glossary ingestion',
    items: [
      'Navbar brand lockup simplified (single SynAc wordmark).',
      'Added NICCS (CISA) cybersecurity vocabulary ingestion (CSV export).',
      'Added NICCS to the seeded Source Registry for staging-first promotion.',
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-01-02',
    title: 'Initial public release',
    items: [
      'Public browse + search for terms and acronyms.',
      'Per-sense citations with license notes and attribution.',
      'Admin surface with Clerk auth + allowlist-gated RBAC.',
      'Ingest system with validation, review gates, and audit trail.',
      'Staging-first ingest with automated promotion and Tier‑1 auto-publish.',
    ],
  },
];
