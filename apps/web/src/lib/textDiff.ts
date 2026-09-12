type DiffToken = { text: string; changed: boolean };

/** Definitions are a few sentences; the quadratic table stays small. */
const MAX_TOKENS = 400;

function tokenize(value: string): string[] {
  return (value.match(/\S+\s*/g) ?? []).slice(0, MAX_TOKENS);
}

function comparable(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function append(tokens: DiffToken[], text: string, changed: boolean): void {
  const last = tokens[tokens.length - 1];
  if (last && last.changed === changed) {
    last.text += text;
    return;
  }
  tokens.push({ text, changed });
}

/**
 * Word-level difference of `text` against `base`, by longest common
 * subsequence of tokens. Tokens keep their trailing whitespace so the rendered
 * run reproduces the original text exactly; only additions are marked, because
 * the reader is comparing another source's wording against the primary one.
 */
export function diffWords(base: string, text: string): DiffToken[] {
  const from = tokenize(base).map(comparable);
  const to = tokenize(text);
  const toKeys = to.map(comparable);
  const rows = from.length;
  const cols = to.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i]![j] =
        from[i] === toKeys[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (j < cols) {
    if (i < rows && from[i] === toKeys[j]) {
      append(tokens, to[j]!, false);
      i += 1;
      j += 1;
    } else if (i < rows && table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      append(tokens, to[j]!, true);
      j += 1;
    }
  }
  return tokens;
}
