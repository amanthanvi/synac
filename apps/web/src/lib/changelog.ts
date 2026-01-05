export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: '2026-01-05',
    title: 'Work in progress',
    items: [],
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
