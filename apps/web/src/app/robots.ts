import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/sitemap';

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
