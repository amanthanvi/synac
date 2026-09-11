import * as cheerio from 'cheerio';

import type { CheerioAPI } from 'cheerio';

import { normalizeWhitespace } from '@synac/db';

/**
 * Parse once per call and keep parsing options consistent across every helper.
 *
 * cheerio 1.x `load()` wraps bare fragments in `<html><head></head><body>...</body></html>`,
 * which is harmless here: every helper below queries by tag/class/id/attribute rather than
 * asserting on the document shape.
 */
function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

/**
 * Escape a value so it is safe to interpolate inside a double-quoted CSS attribute selector
 * string (e.g. `span[id^="..."]`). Backslashes must be escaped first.
 */
function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Remove tags from an HTML fragment WITHOUT decoding entities.
 *
 * This is intentionally still a hand-rolled character scanner rather than a cheerio `.text()`
 * call: `owaspVulnerabilities.ts` composes `decodeHtmlEntities(stripHtmlTags(value))`, and
 * cheerio's `.text()` already decodes entities, so routing this through cheerio would make the
 * downstream `decodeHtmlEntities` call a *double* decode (e.g. `&amp;lt;` -> `<`).
 */
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

/**
 * Standalone entity decoder for the subset of entities the upstream sources emit.
 * Kept hand-rolled (see `stripHtmlTags`) so the strip-then-decode composition stays correct.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      if (!Number.isFinite(n)) return '';
      return String.fromCodePoint(n);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const n = Number.parseInt(hex, 16);
      if (!Number.isFinite(n)) return '';
      return String.fromCodePoint(n);
    })
    .replace(/&amp;/g, '&');
}

/** Inner HTML of the first `<tag>` in document order, or `null` when there is none. */
export function extractFirstInnerHtmlByTag(
  html: string,
  tag: string,
): string | null {
  const $ = loadHtml(html);
  const first = $(tag).first();
  if (first.length === 0) return null;
  return first.html();
}

/**
 * Inner HTML of the first `<tag>` carrying `className` as one of its class tokens
 * (so `page-title` matches `class="foo page-title bar"`), or `null`.
 */
export function extractFirstInnerHtmlByClass(
  html: string,
  tag: string,
  className: string,
): string | null {
  const $ = loadHtml(html);
  // `[class~="x"]` is exactly whitespace-token matching on the class attribute, and avoids
  // needing a CSS identifier escaper (there is no `CSS.escape` global in Node).
  const first = $(`${tag}[class~="${escapeSelectorValue(className)}"]`).first();
  if (first.length === 0) return null;
  return first.html();
}

/**
 * Whitespace-collapsed text of the first `<tag id="id">`, or `null` when the element is
 * absent or its text is empty. `.text()` already decodes entities, so no extra decode here.
 */
export function extractFirstById(
  html: string,
  tag: string,
  id: string,
): string | null {
  const $ = loadHtml(html);
  const first = $(`${tag}[id="${escapeSelectorValue(id)}"]`).first();
  if (first.length === 0) return null;
  return normalizeWhitespace(first.text()) || null;
}

/**
 * Whitespace-collapsed text of every `<tag>` whose `id` starts with `idPrefix`,
 * in document order, dropping empties.
 */
export function extractAllByIdPrefix(
  html: string,
  tag: string,
  idPrefix: string,
): string[] {
  const $ = loadHtml(html);
  const results: string[] = [];
  $(`${tag}[id^="${escapeSelectorValue(idPrefix)}"]`).each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (text) results.push(text);
  });
  return results;
}

/**
 * Every anchor `href` starting with `hrefPrefix`, in document order, duplicates included
 * (callers dedupe). Filtering in JS rather than with a CSS `^=` selector keeps prefixes
 * containing selector metacharacters safe.
 */
export function extractHrefPaths(html: string, hrefPrefix: string): string[] {
  const $ = loadHtml(html);
  const out: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (typeof href === 'string' && href.startsWith(hrefPrefix)) out.push(href);
  });
  return out;
}
