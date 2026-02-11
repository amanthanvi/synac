import styles from './CitationPill.module.css';

export type CitationPillProps = {
  sourceName: string;
  url: string;
  accessedAtLabel: string;
  documentTitle?: string | null;
  licenseNote?: string | null;
  attributionText?: string | null;
  contentMode?: 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED';
};

function formatContentMode(mode: CitationPillProps['contentMode']): string | null {
  if (!mode) return null;
  if (mode === 'QUOTED') return 'Quoted';
  if (mode === 'PARAPHRASED') return 'Paraphrased';
  return 'Summarized';
}

export function CitationPill({
  sourceName,
  url,
  accessedAtLabel,
  documentTitle,
  licenseNote,
  attributionText,
  contentMode,
}: CitationPillProps) {
  const modeLabel = formatContentMode(contentMode);

  return (
    <span className={styles.wrap}>
      <a className={styles.pill} href={url} target="_blank" rel="noopener noreferrer">
        {sourceName}
      </a>
      <span className={styles.popover} role="tooltip">
        <div className={styles.title}>{sourceName}</div>
        {documentTitle ? <div className={styles.doc}>{documentTitle}</div> : null}
        <div className={styles.meta}>
          <span>Accessed {accessedAtLabel}</span>
          {modeLabel ? <span>{modeLabel}</span> : null}
        </div>
        <div className={styles.url}>{url}</div>
        {licenseNote || attributionText ? (
          <div className={styles.note}>
            {licenseNote ? <div>{licenseNote}</div> : null}
            {attributionText ? <div>{attributionText}</div> : null}
          </div>
        ) : null}
      </span>
    </span>
  );
}

