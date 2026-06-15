// Curated, site-facing changelog entries. Repo-canonical changelog lives in `CHANGELOG.md`.
export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  sections: Array<{ title: string; items: string[] }>;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: '2026-03-24',
    title: 'Correctness and operational hardening',
    sections: [
      {
        title: 'Reliability',
        items: [
          'Added focused automated coverage for publish gating, promotion parsing, and search-index helpers.',
          'Added search-index integrity reporting and rebuild tooling for the entry search system.',
        ],
      },
      {
        title: 'Content lifecycle',
        items: [
          'Integrated curated auto-tagging into entry publish flow so newly published content stays discoverable.',
          'Improved promotion safeguards for malformed staged ingest payloads.',
        ],
      },
      {
        title: 'Maintainability',
        items: [
          'Refactored duplicated term/acronym entry rendering into shared public entry components and loaders.',
          'Refactored duplicated browse-page data loading for terms and acronyms.',
        ],
      },
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-02-10',
    title: 'Clinical Reference UI overhaul',
    sections: [
      {
        title: 'Public UI',
        items: [
          'Replaced Signal Ledger with the Clinical Reference visual system: dark-leaning, monospace-forward, and documentation-inspired.',
          'Introduced stacked entry pages with sticky sense navigation, richer metadata, and hover previews.',
          'Removed /trending and aligned navigation, sitemap, and public routes to the new product direction.',
        ],
      },
      {
        title: 'Design system',
        items: [
          'Adopted Geist Sans + Geist Mono across the public site.',
          'Added system-aware theming with dark/light/system persistence and refreshed global design tokens.',
        ],
      },
    ],
  },
  {
    version: 'v0.1.5',
    date: '2026-02-08',
    title: 'Signal Ledger UI overhaul',
    sections: [
      {
        title: 'Public UI',
        items: [
          'New visual system: instrument-panel header over archival paper (dot-grid + grain).',
          'Browse listings redesigned as ledger sheets for faster scanning.',
          'Entry pages: left-rail layout and restyled sense “evidence cards”.',
        ],
      },
      {
        title: 'Typography',
        items: ['Typography refresh: Fraunces display with Instrument Sans + IBM Plex Mono.'],
      },
    ],
  },
  {
    version: 'v0.1.4',
    date: '2026-01-09',
    title: 'Reference Atlas UX refinements',
    sections: [
      {
        title: 'Search & navigation',
        items: [
          'Single global header search with `/` focus shortcut.',
          'Command palette (`⌘K` / `Ctrl+K`) for navigation + quick search.',
        ],
      },
      {
        title: 'Public UI',
        items: [
          'Browse + search listings tightened for faster scanning.',
          'Entry pages: high-sense accordion + hash-to-sense opening behavior.',
        ],
      },
      {
        title: 'Admin',
        items: ['Admin UI consistency pass for key workflows (entries, ingest review, audit, takedown).'],
      },
    ],
  },
  {
    version: 'v0.1.3',
    date: '2026-01-06',
    title: 'Field manual UI overhaul',
    sections: [
      {
        title: 'Public UI',
        items: [
          'Default light “field manual” theme with automatic dark mode.',
          'Entry pages: at-a-glance rail, sense TOC, footnote-style references.',
          'Explore dropdown navigation and refreshed home page.',
        ],
      },
    ],
  },
  {
    version: 'v0.1.2',
    date: '2026-01-06',
    title: 'Tier‑1 source expansion',
    sections: [
      {
        title: 'Ingest',
        items: [
          'Added IETF RFC 4949 Internet Security Glossary ingestion (Tier‑1 source).',
          'Seeded additional MITRE ATT&CK CTI sources (Mobile + ICS).',
        ],
      },
    ],
  },
  {
    version: 'v0.1.1',
    date: '2026-01-06',
    title: 'Branding polish + NICCS glossary ingestion',
    sections: [
      {
        title: 'Public UI',
        items: ['Navbar brand lockup simplified (single SynAc wordmark).'],
      },
      {
        title: 'Ingest',
        items: [
          'Added NICCS (CISA) cybersecurity vocabulary ingestion (CSV export).',
          'Added NICCS to the seeded Source Registry for staging-first promotion.',
        ],
      },
    ],
  },
  {
    version: 'v0.1.0',
    date: '2026-01-02',
    title: 'Initial public release',
    sections: [
      {
        title: 'Public site',
        items: [
          'Public browse + search for terms and acronyms.',
          'Per-sense citations with license notes and attribution.',
        ],
      },
      {
        title: 'Admin',
        items: ['Admin surface with Clerk auth + allowlist-gated RBAC.'],
      },
      {
        title: 'Ingest',
        items: [
          'Ingest system with validation, review gates, and audit trail.',
          'Staging-first ingest with automated promotion and Tier‑1 auto-publish.',
        ],
      },
    ],
  },
];
