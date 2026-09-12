import { normalizeWhitespace } from '@synac/content-tools';

export function stripHtmlTags(html: string): string {
  let out = '';
  let inTag = false;
  for (const ch of html) {
    if (ch === '<') {
      inTag = true;
      continue;
    }
    if (ch === '>') {
      inTag = false;
      continue;
    }
    if (!inTag) out += ch;
  }
  return out;
}

export function extractFirstInnerHtmlByClass(
  html: string,
  tag: string,
  className: string,
): string | null {
  const re = new RegExp(
    `<${tag}[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i',
  );
  const match = html.match(re);
  return match?.[1] ?? null;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match: string, code: string) => {
      const n = Number(code);
      if (!Number.isFinite(n)) return '';
      return String.fromCodePoint(n);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_match: string, hex: string) => {
      const n = Number.parseInt(hex, 16);
      if (!Number.isFinite(n)) return '';
      return String.fromCodePoint(n);
    })
    .replace(/&amp;/g, '&');
}

export function extractFirstById(
  html: string,
  tag: string,
  id: string,
): string | null {
  const re = new RegExp(
    `<${tag}[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i',
  );
  const match = html.match(re);
  if (!match) return null;
  const inner = normalizeWhitespace(
    decodeHtmlEntities(stripHtmlTags(match[1] ?? '')),
  );
  return inner || null;
}

export function extractAllByIdPrefix(
  html: string,
  tag: string,
  idPrefix: string,
): string[] {
  const re = new RegExp(
    `<${tag}[^>]*\\bid=["']${idPrefix}[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'gi',
  );

  const results: string[] = [];
  for (const match of html.matchAll(re)) {
    const inner = normalizeWhitespace(
      decodeHtmlEntities(stripHtmlTags(match[1] ?? '')),
    );
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

export function extractHrefById(
  html: string,
  tag: string,
  id: string,
): string | null {
  const re = new RegExp(`<${tag}\\b([^>]*\\bid=["']${id}["'][^>]*)>`, 'i');
  const attributes = html.match(re)?.[1];
  if (!attributes) return null;
  const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1];
  return href ? decodeHtmlEntities(href) : null;
}
