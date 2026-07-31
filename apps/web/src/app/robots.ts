import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? 'https://synac.example';

  return {
    rules: [
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'ClaudeBot',
          'anthropic-ai',
          'CCBot',
          'Google-Extended',
          'PerplexityBot',
          'Bytespider',
        ],
        disallow: '/',
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
