function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      if (!Number.isFinite(n)) return '';
      return String.fromCodePoint(n);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      if (!Number.isFinite(n)) return '';
      return String.fromCodePoint(n);
    });
}

export function extractFirstById(html: string, tag: string, id: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = html.match(re);
  if (!match) return null;
  const inner = normalizeWhitespace(decodeHtmlEntities(stripHtmlTags(match[1] ?? '')));
  return inner || null;
}

export function extractAllByIdPrefix(html: string, tag: string, idPrefix: string): string[] {
  const re = new RegExp(
    `<${tag}[^>]*\\bid=["']${idPrefix}[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'gi',
  );

  const results: string[] = [];
  for (const match of html.matchAll(re)) {
    const inner = normalizeWhitespace(decodeHtmlEntities(stripHtmlTags(match[1] ?? '')));
    if (inner) results.push(inner);
  }

  return results;
}

export function extractHrefPaths(html: string, hrefPrefix: string): string[] {
  const re = new RegExp(`href=["'](${hrefPrefix}[^"']+)["']`, 'gi');
  const out: string[] = [];
  for (const match of html.matchAll(re)) {
    const href = match[1];
    if (href) out.push(href);
  }
  return out;
}
