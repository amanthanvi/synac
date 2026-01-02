export type SitemapUrl = {
  loc: string;
  lastmod?: Date;
};

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? 'https://synac.example';
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderSitemapIndex(sitemaps: SitemapUrl[]): string {
  const body = sitemaps
    .map((s) => {
      const lastmod = s.lastmod ? `<lastmod>${escapeXml(s.lastmod.toISOString())}</lastmod>` : '';
      return `<sitemap><loc>${escapeXml(s.loc)}</loc>${lastmod}</sitemap>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

export function renderUrlSet(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const lastmod = u.lastmod ? `<lastmod>${escapeXml(u.lastmod.toISOString())}</lastmod>` : '';
      return `<url><loc>${escapeXml(u.loc)}</loc>${lastmod}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

