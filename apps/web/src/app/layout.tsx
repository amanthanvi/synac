import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

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
  } catch {}
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const content = (
    <>
      <a className="srOnly" href="#content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="content">
        <PageShell>{children}</PageShell>
      </main>
      <SiteFooter />
    </>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
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
