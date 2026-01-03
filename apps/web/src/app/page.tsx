import Link from 'next/link';

import { SearchForm } from '@/components/SearchForm';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className={styles.hero}>
      <p className={styles.kicker}>A cybersecurity glossary built for the real web.</p>
      <h1 className={styles.title}>
        Security terms,
        <span className={styles.titleAccent}> unpacked</span>.
      </h1>
      <p className={styles.lede}>
        SynAc centralizes terms and acronyms with disambiguation, references, and
        clear attribution — designed to stay trustworthy as it scales.
      </p>

      <div className={styles.search}>
        <SearchForm placeholder='Try “SAML”, “zero trust”, “SOC”…' />
      </div>

      <div className={styles.quickLinks}>
        <Link className={styles.link} href="/terms?letter=a">
          Browse terms
        </Link>
        <Link className={styles.link} href="/acronyms?letter=a">
          Browse acronyms
        </Link>
        <Link className={styles.link} href="/tags">
          Tags
        </Link>
        <Link className={styles.link} href="/recent">
          Recently updated
        </Link>
      </div>

      <div className={styles.cards} role="list">
        <div className={styles.card} role="listitem">
          <div className={styles.cardTitle}>Disambiguation first</div>
          <div className={styles.cardBody}>
            One page per concept — multiple senses per entry, with clear labels and
            “often confused with” links.
          </div>
        </div>
        <div className={styles.card} role="listitem">
          <div className={styles.cardTitle}>Provenance & attribution</div>
          <div className={styles.cardBody}>
            References are a first-class feature: source, URL, timestamp, and license
            notes are displayed alongside the definition.
          </div>
        </div>
        <div className={styles.card} role="listitem">
          <div className={styles.cardTitle}>Ingest built-in</div>
          <div className={styles.cardBody}>
            Ingest is treated as a core system (not a one-off script): safe acquisition,
            normalization, dedupe, and human review gates.
          </div>
        </div>
      </div>
    </div>
  );
}
