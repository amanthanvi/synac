import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ClerkProvider } from '@clerk/nextjs';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import styles from './_styles/Layout.module.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'SynAc',
    template: '%s · SynAc',
  },
  description:
    'A public, internet-facing cybersecurity glossary with strong provenance and attribution.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isClerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

  // Reading a request header opts this layout into dynamic rendering, which the
  // per-response CSP nonce requires: Next reads the nonce off the request's
  // `content-security-policy` header (set in proxy.ts) and stamps it onto its
  // own inline bootstrap scripts. Public *data* is cached with `unstable_cache`
  // tags instead of caching the HTML. Nothing in this file needs the nonce:
  // the theme bootstrap is a static file covered by `script-src 'self'`.
  await headers();

  const content = (
    <>
      <a className="srOnly" href="#content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="content">
        <div className={styles.shell}>{children}</div>
      </main>
      <SiteFooter />
    </>
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        {/*
          Deliberately synchronous: this must set data-theme before the first
          paint, and `defer`/`async` would let the light palette flash for a
          dark-mode reader. It is a ~20-line static file, so the parser stall is
          negligible. Keeping it in a file (rather than inline) is what lets the
          CSP stay at `script-src 'self'` with no nonce.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body>
        {isClerkConfigured ? (
          <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" dynamic>
            {content}
          </ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
