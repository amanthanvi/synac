import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { CHANGELOG } from '@/lib/changelog';

export const dynamic = 'force-dynamic';

export default function ChangelogPage() {
  return (
    <>
      <PageHeader
        badge="Updates"
        title="Changelog"
        subtitle="Versioned changes to SynAc."
      />

      <div style={{ maxWidth: 820, lineHeight: 1.8 }}>
        <div style={{ marginTop: 10 }}>
          <Link href="/changelog/rss.xml">RSS</Link>
        </div>

        {CHANGELOG.length === 0 ? (
          <p style={{ marginTop: 14, color: 'color-mix(in srgb, var(--fg) 72%, transparent)' }}>
            No changelog entries yet.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 14 }}>
            {CHANGELOG.map((entry) => (
              <li
                key={entry.version}
                id={`v-${entry.version.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 18,
                  padding: 16,
                  background: 'color-mix(in srgb, var(--bg1) 80%, transparent)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 650, letterSpacing: '-0.01em' }}>{entry.version}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
                    {entry.date}
                  </div>
                </div>

                <div style={{ marginTop: 10, color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
                  {entry.title}
                </div>

                {entry.items.length ? (
                  <ul style={{ marginTop: 10, paddingLeft: 18, color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
                    {entry.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
