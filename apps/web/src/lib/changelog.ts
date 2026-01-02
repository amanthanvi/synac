export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    date: '2026-01-02',
    title: 'Work in progress',
    items: [
      'Public term/acronym entry pages with citations.',
      'Search improvements (ranking, snippets, pagination).',
      'Sources directory pages.',
    ],
  },
];

