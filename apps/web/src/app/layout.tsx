import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { getSiteUrl } from '@/lib/sitemap';
import { PageShell } from '@/components/PageShell';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const themeInitScript = `(() => {
  try {
    const stored = window.localStorage.getItem('synac-theme');
    const root = document.documentElement;
    if (stored === 'dark' || stored === 'light') {
      root.setAttribute('data-theme', stored);
    } else {
      root.removeAttribute('data-theme');
    }
  } catch (error) {
    void error;
    document.documentElement.removeAttribute('data-theme');
  }
})();`;

const description =
  'A public, internet-facing cybersecurity glossary with strong provenance and attribution.';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: 'SynAc',
    template: '%s · SynAc',
  },
  description,
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  /* Images come from the opengraph-image / twitter-image file conventions. */
  openGraph: {
    type: 'website',
    siteName: 'SynAc',
    locale: 'en_US',
    title: 'SynAc',
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SynAc',
    description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <a className="srOnly" href="#content">
          Skip to content
        </a>
        <SiteHeader />
        <main id="content">
          <PageShell>{children}</PageShell>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
