import { formatDate, shortHash } from '@/lib/publicFormat';
import { formatContentMode, formatExtractionMethod } from '@/lib/publicLabels';
import type {
  PublicSenseProvenanceRow,
  SenseAttestation,
} from '@/lib/publicEntryPage';

import styles from './SenseProvenance.module.css';

type ProvenanceRecord = {
  key: string;
  sourceName: string;
  sourceSlug: string;
  documentTitle: string | null;
  documentUrl: string;
  citationUrl: string;
  contentSha256: string;
  contentMode: string;
  extractionMethod: string | null;
  extractorVersion: string | null;
  extractedAt: string | null;
  fieldName: string | null;
  sourceLocator: SourceLocator;
};

/** Whatever the ingest adapter stored in the `sourceLocator` Json column. */
type SourceLocator = SenseAttestation['sourceLocator'];

/** A locator that carries nothing worth showing is dropped, not rendered empty. */
function locatorJson(value: SourceLocator): string | null {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value, null, 2);
    return json && json !== 'null' && json !== '{}' ? json : null;
  } catch {
    return null;
  }
}

function fromAttestation(attestation: SenseAttestation): ProvenanceRecord {
  return {
    key: `definition:${attestation.id}`,
    sourceName: attestation.citation.source.name,
    sourceSlug: attestation.citation.source.sourceSlug,
    documentTitle: attestation.citation.sourceDocument.title,
    documentUrl: attestation.citation.sourceDocument.url,
    citationUrl: attestation.citation.url,
    contentSha256: attestation.citation.sourceDocument.contentSha256,
    contentMode: attestation.contentMode,
    extractionMethod: null,
    extractorVersion: attestation.extractorVersion,
    extractedAt: attestation.extractedAt,
    fieldName: 'definition',
    sourceLocator: attestation.sourceLocator,
  };
}

function fromFieldProvenance(row: PublicSenseProvenanceRow): ProvenanceRecord {
  return {
    key: `field:${row.id}`,
    sourceName: row.citation.source.name,
    sourceSlug: row.citation.source.sourceSlug,
    documentTitle: row.citation.sourceDocument.title,
    documentUrl: row.citation.sourceDocument.url,
    citationUrl: row.citation.url,
    contentSha256: row.citation.sourceDocument.contentSha256,
    contentMode: row.contentMode,
    extractionMethod: row.extractionMethod,
    extractorVersion: row.extractorVersion,
    extractedAt: row.extractedAt,
    fieldName: row.fieldName,
    sourceLocator: row.sourceLocator,
  };
}

/**
 * "How this was sourced": the audit trail behind a sense, collapsed by default.
 * Combines per-source attestations with field-level provenance records.
 */
export function SenseProvenance({
  attestations,
  provenance,
}: {
  attestations: SenseAttestation[];
  provenance: PublicSenseProvenanceRow[];
}) {
  const records = [
    ...attestations.map(fromAttestation),
    ...provenance.map(fromFieldProvenance),
  ];
  if (records.length === 0) return null;

  return (
    <details className={styles.wrap}>
      <summary className={styles.summary}>How this was sourced</summary>
      <ol className={styles.list}>
        {records.map((record) => {
          const locator = locatorJson(record.sourceLocator);

          return (
            <li key={record.key} className={styles.item}>
              <div className={styles.head}>
                <a
                  className={styles.source}
                  href={`/sources/${record.sourceSlug}`}
                >
                  {record.sourceName}
                </a>
                <span className={styles.badge}>
                  {formatContentMode(record.contentMode)}
                </span>
              </div>

              {record.documentTitle ? (
                <div className={styles.doc}>{record.documentTitle}</div>
              ) : null}

              <a
                className={styles.url}
                href={record.citationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {record.citationUrl}
              </a>

              {record.documentUrl !== record.citationUrl ? (
                <a
                  className={styles.url}
                  href={record.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {record.documentUrl}
                </a>
              ) : null}

              <dl className={styles.meta}>
                {record.fieldName ? (
                  <>
                    <dt>Field</dt>
                    <dd>{record.fieldName}</dd>
                  </>
                ) : null}
                {record.extractionMethod ? (
                  <>
                    <dt>Method</dt>
                    <dd>{formatExtractionMethod(record.extractionMethod)}</dd>
                  </>
                ) : null}
                {record.extractorVersion ? (
                  <>
                    <dt>Extractor</dt>
                    <dd>{record.extractorVersion}</dd>
                  </>
                ) : null}
                {record.extractedAt ? (
                  <>
                    <dt>Extracted</dt>
                    <dd>{formatDate(record.extractedAt)}</dd>
                  </>
                ) : null}
                <dt>Document hash</dt>
                <dd title={record.contentSha256}>
                  sha256:{shortHash(record.contentSha256)}…
                </dd>
              </dl>

              {locator ? (
                <div className={styles.locator}>
                  <div className={styles.locatorLabel}>Locator</div>
                  <pre className={styles.locatorCode}>
                    <code>{locator}</code>
                  </pre>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
