// Curated, site-facing changelog entries.
// CHANGELOG.md in the repository is the canonical release log — keep the two
// in sync when cutting a release.
export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  sections: Array<{ title: string; items: string[] }>;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: '2026-07-31',
    title: 'Open content model',
    sections: [
      {
        title: 'Content as code',
        items: [
          'All glossary content — terms, senses, citations, tags, and the source registry — now lives in the open-source repository. Changes happen through pull requests, and git history is the audit trail.',
          'Removed accounts and the private admin surface entirely; the site is fully public and anonymous.',
          'Automated source ingest runs in the open: a scheduled workflow refreshes source bundles and opens a reviewable pull request when upstream content changes.',
        ],
      },
      {
        title: 'Under the hood',
        items: [
          'Rebuilt the backend on a clean Convex schema with typed relations; entry pages now load in a single query.',
          'Search, browse, and citation data are compiled and validated before publish, so broken references cannot ship.',
        ],
      },
    ],
  },
  {
    version: 'v0.1.5',
    date: '2026-02-10',
    title: 'Clinical Reference UI',
    sections: [
      {
        title: 'Public UI',
        items: [
          'Adopted the Clinical Reference visual system: dark-leaning, monospace-forward, and documentation-inspired.',
          'Stacked entry pages with sticky sense navigation, richer metadata, and hover previews.',
          'Removed /trending and aligned navigation, sitemap, and public routes to the new product direction.',
        ],
      },
      {
        title: 'Design system',
        items: [
          'Adopted Geist Sans + Geist Mono across the public site.',
          'System-aware theming with dark/light/system persistence and refreshed global design tokens.',
        ],
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
        items: ['Added NICCS (CISA) cybersecurity vocabulary ingestion.'],
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
        title: 'Ingest',
        items: ['Ingest system with validation, review gates, and audit trail.'],
      },
    ],
  },
];
