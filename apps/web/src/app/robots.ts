import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/sitemap';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /search is infinite and near-duplicate; the auth routes have nothing
        // to index. Both are also absent from the sitemaps.
        disallow: ['/admin', '/api', '/search', '/sign-in', '/sign-up'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
