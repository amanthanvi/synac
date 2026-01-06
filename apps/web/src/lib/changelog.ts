export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: '2026-01-06',
    title: 'Work in progress',
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
