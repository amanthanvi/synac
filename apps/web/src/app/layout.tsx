import type { Metadata } from 'next';
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from 'next/font/google';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const instrumentSans = Instrument_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'SynAc',
    template: '%s · SynAc',
  },
  description:
    'A public, internet-facing cybersecurity glossary with strong provenance and attribution.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`}
      >
        <a className="srOnly" href="#content">
          Skip to content
        </a>
        <SiteHeader />
        <main id="content" className="appMain">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
