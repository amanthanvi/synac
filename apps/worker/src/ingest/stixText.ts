/**
 * MITRE ATT&CK STIX descriptions embed inline citation markers such as
 * `(Citation: Mandiant APT1)`. They are references into the bundle's
 * `external_references`, not prose, so they are stripped before the text is
 * stored as a definition or summary. Provenance is recorded separately on
 * `field_provenance` / `sense_definitions`.
 */

// Matches `(Citation: ...)` allowing nested parentheses one level deep, which
// is enough for the shapes MITRE actually emits (e.g. "(Citation: FireEye (2019))").
const CITATION_MARKER = /\(\s*Citation:\s*(?:[^()]|\([^()]*\))*\)/gi;

/** Collapses runs of whitespace, trimming, but preserving paragraph breaks. */
function collapseWhitespacePreservingParagraphs(value: string): string {
  return value
    .split(/\n\s*\n/)
    .flatMap((paragraph) => {
      const collapsed = paragraph
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
      return collapsed ? [collapsed] : [];
    })
    .join('\n\n');
}

/**
 * Removes `(Citation: ...)` markers and tidies the whitespace they leave
 * behind (double spaces, a space before punctuation, dangling separators).
 */
export function stripStixCitations(text: string): string {
  if (!text) return '';

  let out = text.replace(CITATION_MARKER, '');

  // `foo (Citation: X)(Citation: Y).` -> `foo.` and `foo , bar` -> `foo, bar`
  out = out.replace(/[ \t]+([.,;:!?])/g, '$1');
  // Empty brackets left by a marker that was the whole parenthetical.
  out = out.replace(/\(\s*\)/g, '');
  // A trailing separator directly before the closing punctuation.
  out = out.replace(/[ \t]*([.,;:])\s*\1+/g, '$1');

  return collapseWhitespacePreservingParagraphs(out);
}
