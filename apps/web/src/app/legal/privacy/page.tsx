import type { Metadata } from 'next';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../../_styles/Layout.module.css';
import proseStyles from '../../_styles/Prose.module.css';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What SynAc does and does not collect: no cookies for anonymous readers, no per-entry view tracking, and short operational log retention.',
  alternates: { canonical: '/legal/privacy' },
};

const ISSUES_URL = 'https://github.com/amanthanvi/synac/issues';

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        badge="Legal"
        title="Privacy"
        subtitle="A short, plain-language privacy policy."
      />
      <div className={layoutStyles.narrow}>
        <div className={proseStyles.prose}>
          <p>
            SynAc is a public reference that does not require a login to read.
            Reading the site is anonymous, and we keep the data we hold about
            readers to the minimum needed to run it reliably.
          </p>

          <h2>Cookies</h2>
          <p>
            <strong>No cookies are set for anonymous readers.</strong> There is
            no session cookie, no advertising or analytics cookie, and no
            third-party tracker on public pages. Your theme preference (light or
            dark) is stored in your browser&apos;s local storage, on your device
            only. It is never sent to us.
          </p>
          <p>
            Cookies are used only for signed-in editorial and administrative
            accounts, where they are strictly necessary to keep the session
            authenticated.
          </p>

          <h2>Analytics and view tracking</h2>
          <p>
            <strong>We do not track per-entry views.</strong> There is no view
            counter, no trending list built from reader behaviour, and no
            client-side beacon that reports what you read. Nothing you look up
            is associated with you or with a device identifier.
          </p>

          <h2>Operational logs</h2>
          <p>
            Our servers write operational logs so we can diagnose errors and
            abuse. A log line records a generated request id, the time, the HTTP
            method, the path, the response status, and how long the request
            took. Request ids are random per request and are not linked to a
            person or a browsing session.
          </p>
          <p>
            Rate limiting works on coarse, short-lived counters so a single
            client cannot overwhelm the service.
          </p>

          <h2>Retention</h2>
          <p>
            Access logs are retained for <strong>30 days</strong>. Editorial
            audit logs (the record of who changed which entry, which exists so
            published content can be traced and corrected) are retained for{' '}
            <strong>90 days</strong>.
          </p>

          <h2>Questions or requests</h2>
          <p>
            Privacy questions, corrections, and takedown requests go through our
            public issue tracker at{' '}
            <a href={ISSUES_URL}>github.com/amanthanvi/synac/issues</a>. Please
            do not include personal information in a public issue; describe the
            problem and we will follow up on how to share anything sensitive.
          </p>
        </div>
      </div>
    </>
  );
}
