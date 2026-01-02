'use client';

import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <>
      <PageHeader
        badge="500"
        title="Something went wrong"
        subtitle="The page failed to load. Try again, or return home."
      />

      <div style={{ maxWidth: 720, lineHeight: 1.8 }}>
        <p style={{ color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
          {error.digest ? (
            <>
              Request ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{error.digest}</span>
            </>
          ) : (
            <>Request ID unavailable.</>
          )}
        </p>

        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--bg1) 76%, transparent)',
              color: 'var(--fg)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <Link href="/">Home</Link>
          <Link href="/search">Search</Link>
        </div>
      </div>
    </>
  );
}

