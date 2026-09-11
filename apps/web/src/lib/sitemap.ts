import { toIsoString, type DateLike } from './publicFormat';

export type SitemapUrl = {
  loc: string;
  lastmod?: DateLike;
};

/**
 * Chunk size for the term/acronym sitemaps. The sitemaps protocol allows
 * 50,000 URLs per file; 45,000 leaves headroom.
 */
export const SITEMAP_PAGE_SIZE = 45_000;

export function sitemapPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
}

/** The canonical origin, with any trailing slashes removed. */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ??
    'https://synac.example'
  );
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function lastmodTag(value: DateLike | undefined): string {
  if (!value) return '';
  return `<lastmod>${escapeXml(toIsoString(value))}</lastmod>`;
}

export function renderSitemapIndex(sitemaps: SitemapUrl[]): string {
  const body = sitemaps
    .map(
      (entry) =>
        `<sitemap><loc>${escapeXml(entry.loc)}</loc>${lastmodTag(entry.lastmod)}</sitemap>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

export function renderUrlSet(urls: SitemapUrl[]): string {
  const body = urls
    .map(
      (entry) =>
        `<url><loc>${escapeXml(entry.loc)}</loc>${lastmodTag(entry.lastmod)}</url>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}
