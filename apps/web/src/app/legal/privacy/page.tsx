import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../../_styles/Layout.module.css';
import proseStyles from '../../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader title="Privacy Policy" subtitle="How SynAc handles information." />
      <div className={proseStyles.prose}>
        <p>
          <strong>Last updated:</strong> <time dateTime="2026-08-02">August 2, 2026</time>
        </p>

        <h2>Who operates SynAc</h2>
        <p>
          SynAc is an open-source cybersecurity glossary operated and maintained by Aman Thanvi.
          This policy explains how information is handled when you visit{' '}
          <a href="https://synac.app">synac.app</a> or interact with the project.
        </p>

        <h2>Information SynAc processes</h2>
        <p>
          You do not need an account to browse SynAc, and the site does not ask for your name,
          email address, payment details, or profile information.
        </p>
        <p>SynAc processes limited technical information:</p>
        <ul>
          <li>
            <strong>Session cookie.</strong> SynAc sets a first-party cookie named{' '}
            <code>synac_session</code> containing a random identifier. It is HTTP-only, uses
            SameSite=Lax, is sent only over HTTPS in production, and expires after seven days. It
            supports abuse prevention and anonymous view counting.
          </li>
          <li>
            <strong>Request data.</strong> Like most websites, SynAc&apos;s hosting infrastructure
            processes technical request data such as IP address, browser or user-agent details,
            requested URL, request time, and diagnostic events to deliver and secure the site. For
            rate limiting, SynAc uses the session identifier when available; otherwise it uses a
            salted hash of the IP address or user-agent rather than storing the raw value in the
            application database.
          </li>
          <li>
            <strong>Pseudonymous entry views.</strong> When an entry is viewed, SynAc records the
            entry key, timestamps, a count, and a salted hash of the session identifier. The raw
            session identifier is not stored with the view record. Repeat views within 30 minutes
            are deduplicated.
          </li>
          <li>
            <strong>Information you submit.</strong> If you email the maintainer or participate in
            the public GitHub repository, SynAc receives the information you choose to provide.
            GitHub activity may be public and is also governed by GitHub&apos;s own terms and privacy
            practices.
          </li>
        </ul>

        <h2>Why this information is used</h2>
        <p>SynAc uses this limited information to:</p>
        <ul>
          <li>deliver, maintain, troubleshoot, and secure the site;</li>
          <li>enforce rate limits and prevent abuse;</li>
          <li>produce aggregate entry popularity counts from pseudonymous view records; and</li>
          <li>respond to messages, correction requests, and legal obligations.</li>
        </ul>

        <h2>Service providers and disclosure</h2>
        <p>
          SynAc uses{' '}
          <a href="https://vercel.com/legal/privacy-notice">Vercel</a> for web hosting and{' '}
          <a href="https://www.convex.dev/legal/privacy">Convex</a> for the application database.
          These providers process information on SynAc&apos;s behalf under their own privacy terms.
          Project contributions and issue discussions take place on{' '}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub
          </a>
          .
        </p>
        <p>
          SynAc does not sell or rent personal information, serve targeted advertising, or build
          marketing profiles. Information may be disclosed when reasonably necessary to comply
          with law, protect rights or safety, investigate abuse, or operate the services described
          above.
        </p>

        <h2>Retention</h2>
        <p>
          The session cookie expires after seven days. Pseudonymous entry-view records are deleted
          after 90 days without activity, with cleanup running daily. Hosting and security logs may
          be retained by service providers according to their policies. Emails, public GitHub
          activity, and legal records may be kept as reasonably necessary for their purpose.
        </p>

        <h2>Your choices and rights</h2>
        <p>
          You can delete or block the session cookie in your browser. Blocking it may prevent view
          counting and causes rate limiting to use a salted network or browser identifier instead.
          Depending on where you live, you may have rights to request access, correction, deletion,
          or restriction of personal information. Because SynAc has no user accounts and uses
          pseudonymous identifiers, it may not be possible to associate an application record with
          a particular person.
        </p>

        <h2>Security and external links</h2>
        <p>
          SynAc uses safeguards intended to limit collection and protect stored information, but no
          internet service can guarantee absolute security. Entries link to third-party sources;
          those sites control their own privacy practices.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          This policy may change as SynAc&apos;s features or legal obligations change. The date above
          will be updated when revisions are published.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions or requests, email{' '}
          <a href="mailto:amanthanvi2002@gmail.com">amanthanvi2002@gmail.com</a>. For security
          vulnerabilities, follow the project&apos;s{' '}
          <a href="https://github.com/amanthanvi/synac/security/policy">private reporting policy</a>{' '}
          instead of opening a public issue.
        </p>
      </div>
    </div>
  );
}
