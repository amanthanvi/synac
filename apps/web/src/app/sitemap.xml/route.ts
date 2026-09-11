import { NextResponse } from 'next/server';

import { getSitemapEntryCount, getSitemapLastmodMap } from '@/lib/publicData';
import {
  getSiteUrl,
  renderSitemapIndex,
  sitemapPageCount,
  type SitemapUrl,
} from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const siteUrl = getSiteUrl();

  const [lastmods, termCount, acronymCount] = await Promise.all([
    getSitemapLastmodMap(),
    getSitemapEntryCount('TERM'),
    getSitemapEntryCount('ACRONYM'),
  ]);

  const sitemapUrl = (loc: string, lastmod: string | null): SitemapUrl => {
    const url: SitemapUrl = { loc };
    if (lastmod) url.lastmod = lastmod;
    return url;
  };

  const entryPages = (
    path: string,
    count: number,
    lastmod: string | null,
  ): SitemapUrl[] =>
    Array.from({ length: sitemapPageCount(count) }, (_, index) =>
      // Page 1 keeps the bare URL so existing submissions stay valid.
      sitemapUrl(
        index === 0
          ? `${siteUrl}${path}`
          : `${siteUrl}${path}?page=${index + 1}`,
        lastmod,
      ),
    );

  const xml = renderSitemapIndex([
    { loc: `${siteUrl}/sitemap-static.xml` },
    ...entryPages('/sitemap-terms.xml', termCount, lastmods.terms),
    ...entryPages('/sitemap-acronyms.xml', acronymCount, lastmods.acronyms),
    sitemapUrl(`${siteUrl}/sitemap-tags.xml`, lastmods.tags),
    sitemapUrl(`${siteUrl}/sitemap-sources.xml`, lastmods.sources),
  ]);

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
