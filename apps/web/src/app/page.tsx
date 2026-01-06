import Link from 'next/link';

import { SearchForm } from '@/components/SearchForm';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className={styles.hero}>
      <div className={styles.grid}>
        <section className={styles.copy} aria-label="Introduction">
          <p className={styles.kicker}>
            <span className={styles.kickerLabel}>Field manual</span>
            <span className={styles.kickerSep}>·</span>
            Cybersecurity glossary
          </p>
          <h1 className={styles.title}>
            Security language,
            <span className={styles.titleAccent}> with receipts</span>.
          </h1>
          <p className={styles.lede}>
            SynAc centralizes terms and acronyms with disambiguation, references, and clear
            attribution — designed to stay trustworthy as it scales.
          </p>

          <div className={styles.search}>
            <SearchForm placeholder='Try “SAML”, “zero trust”, “SOC”…' />
          </div>

          <div className={styles.actions}>
            <ButtonLink href="/terms?letter=a" variant="primary">
              Browse terms
            </ButtonLink>
            <ButtonLink href="/acronyms?letter=a" variant="ghost">
              Browse acronyms
            </ButtonLink>
            <ButtonLink href="/tags" variant="ghost">
              Tags
            </ButtonLink>
            <ButtonLink href="/recent" variant="ghost">
              Recent
            </ButtonLink>
          </div>
        </section>

        <aside className={styles.sidebar} aria-label="How SynAc works">
          <Panel className={styles.note}>
            <div className={styles.noteTitle}>What you’ll see on every entry</div>
            <ul className={styles.noteList}>
              <li>
                <strong>Meaning(s)</strong>, with stable anchors per sense.
              </li>
              <li>
                <strong>Stands for</strong> and <strong>Also known as</strong> when available.
              </li>
              <li>
                <strong>References</strong> per sense: source, URL, timestamp, license notes.
              </li>
            </ul>

            <div className={styles.noteLinks}>
              <Link href="/sources">See all sources</Link>
              <span className={styles.noteDot}>·</span>
              <Link href="/about">Attribution philosophy</Link>
            </div>
          </Panel>
        </aside>
      </div>

      <div className={styles.cards} role="list" aria-label="Core principles">
        <Panel className={styles.card} as="section">
          <div className={styles.cardTitle}>Disambiguation first</div>
          <div className={styles.cardBody}>
            One page per concept — multiple senses per entry, with clear labels and “often confused
            with” links.
          </div>
        </Panel>
        <Panel className={styles.card} as="section">
          <div className={styles.cardTitle}>Provenance & attribution</div>
          <div className={styles.cardBody}>
            Definitions are anchored to sources. Citations and license notes are displayed alongside
            the content.
          </div>
        </Panel>
        <Panel className={styles.card} as="section">
          <div className={styles.cardTitle}>Ingest built-in</div>
          <div className={styles.cardBody}>
            Ingest is a core system (not a one-off script): safe acquisition, normalization, dedupe,
            and human review gates.
          </div>
        </Panel>
      </div>
    </div>
  );
}
