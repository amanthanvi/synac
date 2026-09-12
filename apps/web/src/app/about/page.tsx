import Link from 'next/link';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../_styles/Layout.module.css';
import proseStyles from '../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

const title = 'About';
const description =
  'How SynAc entries are structured, sourced, and maintained in the open-source repository.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/about' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default function AboutPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="About SynAc"
        subtitle="A cybersecurity glossary designed for practitioners: disambiguation, provenance, and attribution as first-class features."
      />

      <div className={proseStyles.prose}>
        <p>
          SynAc is a public reference for cybersecurity terms and acronyms. The
          goal is simple: help you answer &quot;what does this mean here?&quot;
          quickly, with enough context to trust the result.
        </p>

        <h2>How to read entries</h2>
        <ul>
          <li>
            <strong>Type:</strong> every entry is either a term or an acronym,
            shown by the small label next to the headword.
          </li>
          <li>
            <strong>Senses:</strong> each numbered sense is a distinct meaning.
            Entries with several senses include an on-page list to jump between
            them.
          </li>
          <li>
            <strong>Sources:</strong> each sense lists the sources that support
            it, with document title, access date, whether the text is quoted,
            paraphrased, or summarized, and any license or attribution notes.
          </li>
        </ul>

        <p>
          Explore the full registry of provenance at{' '}
          <Link href="/sources">Sources</Link>, or browse the taxonomy at{' '}
          <Link href="/tags">Tags</Link>.
        </p>

        <h2>How content is maintained</h2>
        <p>
          All content, including terms, senses, citations, tags, and the source
          registry, lives in the{' '}
          <a
            href="https://github.com/amanthanvi/synac"
            target="_blank"
            rel="noopener noreferrer"
          >
            open-source repository
          </a>
          . Changes happen through pull requests: automated ingest proposes
          updates from authoritative sources, and humans review every change
          before it publishes. To suggest a term, propose a source, or request a
          correction or removal, open an issue on GitHub. The git history is the
          public audit trail.
        </p>
      </div>
    </div>
  );
}
