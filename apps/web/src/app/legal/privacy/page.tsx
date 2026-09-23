import type { Metadata } from 'next';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../../_styles/Layout.module.css';
import proseStyles from '../../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

const title = 'Privacy Policy';
const description =
  'What SynAc processes when you read it, and what it does not.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/legal/privacy' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default function PrivacyPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Privacy Policy"
        subtitle="How SynAc handles information."
      />
      <div className={proseStyles.prose}>
        <p>
          <strong>Last updated:</strong>{' '}
          <time dateTime="2026-09-23">September 23, 2026</time>
        </p>

        <h2>Who operates SynAc</h2>
        <p>
          SynAc is an open-source cybersecurity glossary operated and maintained
          by Aman Thanvi. This policy explains how information is handled when
          you visit <a href="https://synac.app">synac.app</a> or interact with
          the project.
        </p>

        <h2>Information SynAc processes</h2>
        <p>
          You do not need an account to browse SynAc, and the site does not ask
          for your name, email address, payment details, or profile information.
          SynAc sets no cookies and uses no local storage for readers, apart
          from the theme preference you choose yourself, which never leaves your
          browser. There is no advertising script, and SynAc keeps no view
          counts or reading history of its own. One Vercel measurement script,
          Speed Insights, reports how quickly pages load; it is described below.
        </p>
        <p>SynAc processes limited technical information:</p>
        <ul>
          <li>
            <strong>Request data.</strong> Like most websites, SynAc&apos;s
            hosting infrastructure processes technical request data such as IP
            address, browser or user-agent details, requested URL, and request
            time to deliver and secure the site.
          </li>
          <li>
            <strong>Rate-limit counters.</strong> To keep the search endpoints
            available, SynAc counts requests per caller. The counter is keyed by
            a salted SHA-256 hash of the client IP address, or of the user-agent
            string when no forwarded address is present. The raw address, the
            raw user-agent, and the salt are never written to the application
            database, and the hash is not used to identify or profile a reader.
          </li>
          <li>
            <strong>Performance measurements.</strong> Vercel Speed Insights
            measures how quickly pages load and respond to input (Core Web
            Vitals). Each measurement reports the page address with its query
            string removed, so search terms are left out of it, along with the
            page&apos;s route, the page element involved and whether a click or
            key press triggered it, the browser, operating system, device type
            and brand, connection speed, and an approximate location (country,
            region, and city). The script sets no cookies. Vercel&apos;s records
            include a device identifier, and Vercel states that Speed Insights
            collects nothing that would let it reconstruct a browsing session or
            identify a user. SynAc sees only aggregate reports. Browsers that
            send a Global Privacy Control signal are not measured.
          </li>
          <li>
            <strong>Operational logs.</strong> Diagnostic events carry a request
            identifier, the event, and redacted fields; authorization, cookie,
            token, secret, and session values are replaced before a log line is
            written.
          </li>
          <li>
            <strong>Information you submit.</strong> If you open an issue or
            participate in the public GitHub repository, SynAc receives the
            information you choose to provide. GitHub activity may be public and
            is also governed by GitHub&apos;s own terms and privacy practices.
          </li>
        </ul>

        <h2>Why this information is used</h2>
        <p>SynAc uses this limited information to:</p>
        <ul>
          <li>deliver, maintain, troubleshoot, and secure the site;</li>
          <li>measure page performance and find slow pages;</li>
          <li>enforce rate limits and prevent abuse; and</li>
          <li>
            respond to issues, correction requests, and legal obligations.
          </li>
        </ul>

        <h2>Service providers and disclosure</h2>
        <p>
          SynAc uses{' '}
          <a href="https://vercel.com/legal/privacy-notice">Vercel</a> for web
          hosting and for{' '}
          <a href="https://vercel.com/docs/speed-insights/privacy-policy">
            Speed Insights
          </a>
          , and <a href="https://www.convex.dev/legal/privacy">Convex</a> for
          the application database. These providers process information on
          SynAc&apos;s behalf under their own privacy terms. Project
          contributions and issue discussions take place on{' '}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub
          </a>
          .
        </p>
        <p>
          SynAc does not sell or rent personal information, serve targeted
          advertising, or build marketing profiles. Information may be disclosed
          when reasonably necessary to comply with law, protect rights or
          safety, investigate abuse, or operate the services described above.
        </p>

        <h2>Retention</h2>
        <p>
          Rate-limit counters are short-lived and expire with their window; they
          hold a hash and a count, never a raw identifier. Hosting and security
          logs, and Speed Insights measurements, may be retained by service
          providers according to their policies. Public GitHub activity and
          legal records may be kept as reasonably necessary for their purpose.
        </p>

        <h2>Your choices and rights</h2>
        <p>
          Depending on where you live, you may have rights to request access,
          correction, deletion, or restriction of personal information. Because
          SynAc has no user accounts, no cookies, and no reading history, it
          generally holds nothing that can be associated with a particular
          person. If your browser sends a Global Privacy Control signal,
          SynAc&apos;s pages send no Speed Insights measurements for your
          visits.
        </p>

        <h2>Security and external links</h2>
        <p>
          SynAc uses safeguards intended to limit collection and protect stored
          information, but no internet service can guarantee absolute security.
          Entries link to third-party sources; those sites control their own
          privacy practices.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          This policy may change as SynAc&apos;s features or legal obligations
          change. The date above will be updated when revisions are published.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions or requests, open an issue on the project&apos;s{' '}
          <a href="https://github.com/amanthanvi/synac/issues">
            public issue tracker
          </a>
          . For security vulnerabilities, follow the project&apos;s{' '}
          <a href="https://github.com/amanthanvi/synac/security/policy">
            private reporting policy
          </a>{' '}
          instead of opening a public issue.
        </p>
      </div>
    </div>
  );
}
