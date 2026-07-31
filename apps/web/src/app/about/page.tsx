import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../_styles/Layout.module.css';
import proseStyles from '../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function AboutPage() {
  return (
    <>
      <PageHeader
        badge="About"
        title="About SynAc"
        subtitle="A cybersecurity glossary designed for practitioners: disambiguation, provenance, and attribution as first-class features."
      />

      <div className={layoutStyles.narrow}>
        <div className={proseStyles.prose}>
          <p>
            SynAc is a public reference for cybersecurity terms and acronyms. The goal is simple:
            help you answer “what does this mean here?” quickly, with enough context to trust the
            result.
          </p>

          <h2>How to read entries</h2>
          <ul>
            <li>
              <strong>Type badge:</strong> every entry is either a <strong>TERM</strong> or an{' '}
              <strong>ACRONYM</strong>.
            </li>
            <li>
              <strong>Senses:</strong> each sense is a distinct meaning. Use the on-page table of
              contents to jump between them.
            </li>
            <li>
              <strong>Source pills:</strong> small inline pills indicate which source supports a
              given piece of text. Hover for details (document title, URL, access date, license
              notes).
            </li>
            <li>
              <strong>Bibliography:</strong> each sense includes a reference list for deeper
              reading and attribution.
            </li>
          </ul>

          <p>
            Explore the full registry of provenance at <Link href="/sources">Sources</Link>, or
            browse the taxonomy at <Link href="/tags">Tags</Link>.
          </p>

          <h2>How content is maintained</h2>
          <p>
            All content — terms, senses, citations, tags, and the source registry — lives in the{' '}
            <a
              href="https://github.com/amanthanvi/synac"
              target="_blank"
              rel="noopener noreferrer"
            >
              open-source repository
            </a>
            . Changes happen through pull requests: automated ingest proposes updates from
            authoritative sources, and humans review every change before it publishes. To suggest a
            term, propose a source, or request a correction or removal, open an issue on GitHub —
            the git history is the public audit trail.
          </p>
        </div>
      </div>
    </>
  );
}
