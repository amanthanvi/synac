'use client';

import { useId, useState } from 'react';

import styles from './SenseTools.module.css';

type CiteSenseButtonProps = {
  bibtex: string;
  plain: string;
  jsonHref: string;
};

/** "Cite this sense" disclosure: BibTeX, plain text, and a JSON record link. */
export function CiteSenseButton({
  bibtex,
  plain,
  jsonHref,
}: CiteSenseButtonProps) {
  const panelId = `cite-${useId()}`;
  const [open, setOpen] = useState(false);

  return (
    <span className={styles.citeWrap}>
      <button
        type="button"
        className={styles.toolButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Cite this sense
      </button>

      <div className={styles.citePanel} id={panelId} hidden={!open}>
        <div className={styles.citeBlock}>
          <div className={styles.citeLabel}>Plain text</div>
          <p className={styles.citePlain}>{plain}</p>
        </div>

        <div className={styles.citeBlock}>
          <div className={styles.citeLabel}>BibTeX</div>
          <pre className={styles.citeCode}>
            <code>{bibtex}</code>
          </pre>
        </div>

        <a className={styles.citeLink} href={jsonHref}>
          Download citation record (JSON)
        </a>
      </div>
    </span>
  );
}
