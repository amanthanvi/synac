import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../../_styles/Layout.module.css';
import proseStyles from '../../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader title="Terms of Use" subtitle="Terms for using SynAc." />
      <div className={proseStyles.prose}>
        <p>
          <strong>Last updated:</strong> <time dateTime="2026-08-02">August 2, 2026</time>
        </p>

        <h2>Agreement</h2>
        <p>
          These terms apply when you access or use SynAc at{' '}
          <a href="https://synac.app">synac.app</a>. By using the site, you agree to these terms. If
          you do not agree, do not use the site. SynAc is operated and maintained by Aman Thanvi.
        </p>

        <h2>Informational purpose</h2>
        <p>
          SynAc is a reference glossary, not professional cybersecurity, legal, compliance, or
          other advice. Definitions are compiled and curated from identified sources, but they may
          be incomplete, outdated, or unsuitable for a particular context. Verify important
          information with the cited source and a qualified professional when appropriate.
        </p>

        <h2>Permitted use</h2>
        <p>
          You may browse, link to, and make reasonable use of the site and its public API, subject
          to these terms and applicable law. You must not:
        </p>
        <ul>
          <li>interfere with, overload, probe, or disrupt the site or its infrastructure;</li>
          <li>evade rate limits, access controls, or other technical protections;</li>
          <li>use the site to distribute malware or facilitate unlawful activity;</li>
          <li>misrepresent SynAc content, attribution, provenance, or your affiliation with SynAc;</li>
          <li>infringe another person&apos;s intellectual-property, privacy, or other rights; or</li>
          <li>use automated access in a way that materially degrades service for others.</li>
        </ul>

        <h2>Code, content, and attribution</h2>
        <p>
          SynAc&apos;s software is available under the repository&apos;s{' '}
          <a href="https://github.com/amanthanvi/synac/blob/main/LICENSE">MIT License</a>. Glossary
          material may come from third-party sources with separate licenses or terms. The software
          license does not relicense that third-party material. Before copying, redistributing, or
          adapting an entry, review its source attribution and applicable source terms.
        </p>
        <p>
          If you contribute code, documentation, or content, you confirm that you have the right to
          submit it and that it does not knowingly violate another person&apos;s rights. Contributions
          are also subject to the repository&apos;s{' '}
          <a href="https://github.com/amanthanvi/synac/blob/main/CONTRIBUTING.md">
            contribution guidelines
          </a>{' '}
          and applicable license terms.
        </p>

        <h2>Corrections and removal requests</h2>
        <p>
          SynAc welcomes corrections, attribution concerns, and content-removal requests through
          the repository&apos;s{' '}
          <a href="https://github.com/amanthanvi/synac/issues">public issue tracker</a>. Do not post
          confidential information or security vulnerabilities there; report vulnerabilities using
          the{' '}
          <a href="https://github.com/amanthanvi/synac/security/policy">security policy</a>.
        </p>

        <h2>Third-party services and links</h2>
        <p>
          SynAc links to source material and services controlled by others. Those third parties are
          responsible for their content, availability, privacy practices, and terms. A link or
          attribution does not imply endorsement.
        </p>

        <h2>Availability and changes</h2>
        <p>
          Features, content, APIs, and availability may be changed, limited, suspended, or
          discontinued at any time. Access may be restricted when reasonably necessary to protect
          SynAc, its users, or others, or to respond to misuse or legal obligations. These terms may
          also be updated; the date above identifies the current version. Continued use after an
          update means you accept the revised terms.
        </p>

        <h2>Disclaimer of warranties</h2>
        <p>
          To the maximum extent permitted by law, SynAc and its content are provided &quot;as
          is&quot; and &quot;as available,&quot; without warranties of any kind, express or
          implied, including warranties of accuracy, reliability, availability, fitness for a
          particular purpose, title, and non-infringement.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Aman Thanvi and SynAc contributors will not be
          liable for indirect, incidental, special, consequential, exemplary, or punitive damages,
          or for loss of data, profits, goodwill, or business opportunities arising from or related
          to the site. Where liability cannot be excluded, it is limited to the minimum amount
          permitted by applicable law.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms may be sent to{' '}
          <a href="mailto:amanthanvi2002@gmail.com">amanthanvi2002@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
