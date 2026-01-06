import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPrismaClient, resolvePublicSourceBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { KeyValueList } from '@/components/ui/KeyValue';
import { Panel } from '@/components/ui/Panel';

import layoutStyles from '../../_styles/Layout.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type SourcePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: SourcePageProps): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const source = await resolvePublicSourceBySlug(prisma, { slug });

  if (!source) {
    return { title: 'Source not found' };
  }

  return {
    title: source.name,
    description: `License notes and attribution requirements for ${source.name}.`,
    alternates: { canonical: `/sources/${source.sourceSlug}` },
  };
}

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

      <div className={styles.wrap}>
        <Panel className={layoutStyles.narrow}>
          <KeyValueList
            items={[
              {
                label: 'Verified',
                value: source.lastVerifiedAt
                  ? `Verified ${formatDate(source.lastVerifiedAt)}`
                  : 'Not yet verified',
              },
              { label: 'License', value: source.licenseType },
              { label: 'Trust', value: source.trustTier },
            ]}
          />

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Base URL</div>
            <a className={styles.link} href={source.baseUrl} target="_blank" rel="noopener noreferrer">
              {source.baseUrl}
            </a>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Attribution</div>
            <p className={styles.sectionText}>{source.attributionRequirements}</p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Allowed use</div>
            <p className={styles.sectionText}>{source.allowedUse}</p>
          </div>

          {source.licenseNotes ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>License notes</div>
              <p className={styles.sectionText}>{source.licenseNotes}</p>
            </div>
          ) : null}

          {source.contact ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Contact</div>
              <p className={styles.sectionText}>{source.contact}</p>
            </div>
          ) : null}

          <div className={styles.actions}>
            <ButtonLink href="/sources" size="sm">
              All sources
            </ButtonLink>
          </div>
        </Panel>
      </div>
    </>
  );
}
