import Link from 'next/link';

const PREVIEWS = [
  { href: '/preview/entry-acronym', label: 'Entry — acronym, 3 senses (SOC)' },
  { href: '/preview/entry-term', label: 'Entry — term, 1 sense, duplicated summary (default credentials)' },
  { href: '/preview/entry-long', label: 'Entry — 12 senses (shell)' },
  { href: '/preview/entry-loading', label: 'Entry — loading skeleton' },
] as const;

export default function PreviewIndex() {
  return (
    <div style={{ display: 'grid', gap: 8, padding: '24px 0' }}>
      <h1>Design previews (dev only)</h1>
      <ul style={{ listStyle: 'none', display: 'grid', gap: 6 }}>
        {PREVIEWS.map((p) => (
          <li key={p.href}>
            <Link href={p.href} style={{ textDecoration: 'underline' }}>
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
