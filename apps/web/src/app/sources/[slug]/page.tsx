import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getPrismaClient, resolvePublicSourceBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

type SourcePageProps = {
  params: Promise<{ slug: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function SourcePage({ params }: SourcePageProps) {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const source = await resolvePublicSourceBySlug(prisma, { slug });

  if (!source) notFound();

  return (
    <>
      <PageHeader
        badge="Source"
        title={source.name}
        subtitle="License notes and attribution requirements for this source."
      />

      <div style={{ maxWidth: 820, lineHeight: 1.8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
            {source.lastVerifiedAt ? (
              <>Verified {formatDate(source.lastVerifiedAt)}</>
            ) : (
              <>Not yet verified</>
            )}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
            · {source.licenseType}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>
            · {source.trustTier}
          </span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              opacity: 0.75,
              marginBottom: 6,
            }}
          >
            Base URL
          </div>
          <a href={source.baseUrl} target="_blank" rel="noopener noreferrer">
            {source.baseUrl}
          </a>
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              opacity: 0.75,
              marginBottom: 6,
            }}
          >
            Attribution
          </div>
          <p style={{ color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
            {source.attributionRequirements}
          </p>
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              opacity: 0.75,
              marginBottom: 6,
            }}
          >
            Allowed use
          </div>
          <p style={{ color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
            {source.allowedUse}
          </p>
        </div>

        {source.licenseNotes ? (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.75,
                marginBottom: 6,
              }}
            >
              License notes
            </div>
            <p style={{ color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
              {source.licenseNotes}
            </p>
          </div>
        ) : null}

        {source.contact ? (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.75,
                marginBottom: 6,
              }}
            >
              Contact
            </div>
            <p style={{ color: 'color-mix(in srgb, var(--fg) 78%, transparent)' }}>
              {source.contact}
            </p>
          </div>
        ) : null}

        <div style={{ marginTop: 22 }}>
          <Link href="/sources">All sources</Link>
        </div>
      </div>
    </>
  );
}

