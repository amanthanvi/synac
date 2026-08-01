import type { ReactNode } from 'react';

// Search snippets mark matched tokens with << >> delimiters; render them as <mark>.
export function renderHeadline(headline: string): ReactNode {
  const pieces: ReactNode[] = [];
  const tokens = headline.split(/(<<|>>)/g);
  let highlight = false;
  let key = 0;

  for (const token of tokens) {
    if (!token) continue;
    if (token === '<<') {
      highlight = true;
      continue;
    }
    if (token === '>>') {
      highlight = false;
      continue;
    }

    pieces.push(highlight ? <mark key={key++}>{token}</mark> : <span key={key++}>{token}</span>);
  }

  return <>{pieces}</>;
}
