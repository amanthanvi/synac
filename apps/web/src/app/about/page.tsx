import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../_styles/Layout.module.css';
import proseStyles from '../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function AboutPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="About SynAc"
        subtitle="A cybersecurity glossary designed for practitioners: disambiguation, provenance, and attribution as first-class features."
      />

      <div className={proseStyles.prose}>
        <p>
          SynAc is a public reference for cybersecurity terms and acronyms. The goal is simple:
          help you answer “what does this mean here?” quickly, with enough context to trust the
          result.
        </p>

        <h2>How to read entries</h2>
        <ul>
          <li>
            <strong>Type:</strong> every entry is either a term or an acronym — the small label
            next to the headword.
          </li>
          <li>
            <strong>Senses:</strong> each numbered sense is a distinct meaning. Entries with
            several senses include an on-page list to jump between them.
          </li>
          <li>
            <strong>Sources:</strong> each sense lists the sources that support it — with document
            title, access date, whether the text is quoted, paraphrased, or summarized, and any
            license or attribution notes.
          </li>
        </ul>

        <p>
          Explore the full registry of provenance at <Link href="/sources">Sources</Link>, or
          browse the taxonomy at <Link href="/tags">Tags</Link>.
        </p>
      </div>
    </div>
  );
}
