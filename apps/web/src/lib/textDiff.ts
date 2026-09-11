/**
 * Word-level diff used by the sense concordance view.
 *
 * The concordance shows one definition per source side by side; readers care
 * about "what does this source say that the primary one does not". So the diff
 * is one-directional: tokens of `candidate` that are absent from the longest
 * common subsequence with `base` are marked as insertions. Deletions are not
 * reported, because the primary column already shows them.
 */

export type DiffSegment = {
  kind: 'same' | 'added';
  text: string;
};

/** Above this token count the quadratic LCS table is not worth building. */
const MAX_TOKENS = 900;

function tokenize(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

/** Compare tokens ignoring case and edge punctuation, so "TLS," matches "tls". */
function compareKey(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function push(
  segments: DiffSegment[],
  kind: DiffSegment['kind'],
  text: string,
): void {
  const last = segments[segments.length - 1];
  if (last?.kind === kind) last.text = `${last.text} ${text}`;
  else segments.push({ kind, text });
}

/**
 * Segments of `candidate`, with runs that do not appear in `base` marked
 * `added`. Adjacent segments of the same kind are merged.
 */
export function diffWords(base: string, candidate: string): DiffSegment[] {
  const tokens = tokenize(candidate);
  if (tokens.length === 0) return [];

  const baseKeys = tokenize(base).map(compareKey);
  if (baseKeys.length === 0) return [{ kind: 'added', text: tokens.join(' ') }];

  if (baseKeys.length > MAX_TOKENS || tokens.length > MAX_TOKENS) {
    return [{ kind: 'same', text: tokens.join(' ') }];
  }

  const keys = tokens.map(compareKey);
  const cols = keys.length + 1;
  // lcs[i * cols + j] is the LCS length of baseKeys[i..] and keys[j..].
  const lcs = new Array<number>((baseKeys.length + 1) * cols).fill(0);
  const at = (i: number, j: number): number => lcs[i * cols + j] ?? 0;

  for (let i = baseKeys.length - 1; i >= 0; i -= 1) {
    for (let j = keys.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        baseKeys[i] === keys[j]
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;

  for (let j = 0; j < keys.length; ) {
    const token = tokens[j];
    if (token === undefined) break;

    if (i < baseKeys.length && baseKeys[i] === keys[j]) {
      push(segments, 'same', token);
      i += 1;
      j += 1;
    } else if (i < baseKeys.length && at(i + 1, j) >= at(i, j + 1)) {
      // Dropping a base token keeps the subsequence at least as long, so the
      // base token is a deletion, which this diff does not report.
      i += 1;
    } else {
      push(segments, 'added', token);
      j += 1;
    }
  }

  return segments;
}

/** True when `candidate` contributes at least one word the base text lacks. */
export function hasDifferences(base: string, candidate: string): boolean {
  return diffWords(base, candidate).some((segment) => segment.kind === 'added');
}
