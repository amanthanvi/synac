import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

function xmlEscape(s: string) {
  return String(s).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&#' + '38;';
      case '<':
        return '&#' + '60;';
      case '>':
        return '&#' + '62;';
      case '"':
        return '&#' + '34;';
      case "'":
        return '&#' + '39;';
      default:
        return ch;
    }
  });
}

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() ?? 'https://synac.app/').replace(/\/+$/, '/') as string;

  // Root entry
  const entries: {
    loc: string;
    lastmod?: string;
    changefreq?: string;
    priority?: string;
  }[] = [
    {
      loc: new URL('/', base).toString(),
      changefreq: 'weekly',
      priority: '0.8',
    },
  ];

  // Term pages from content collection
  const terms = await getCollection('terms');
  for (const t of terms) {
    const loc = new URL(`/terms/${t.slug}`, base).toString();
    const updatedAt = (t.data as any)?.updatedAt;
    let lastmod: string | undefined;
    if (updatedAt) {
      try {
        lastmod = new Date(updatedAt).toISOString();
      } catch {
        // noop
      }
    }
    entries.push({
      loc,
      lastmod,
      changefreq: 'monthly',
      priority: '0.6',
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${xmlEscape(e.lastmod)}</lastmod>` : ''}
    ${e.changefreq ? `<changefreq>${xmlEscape(e.changefreq)}</changefreq>` : ''}
    ${e.priority ? `<priority>${xmlEscape(e.priority)}</priority>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
