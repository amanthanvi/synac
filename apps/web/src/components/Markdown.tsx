import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './Markdown.module.css';

type MarkdownProps = {
  children: string;
};

function safeUrl(url: string): string {
  const trimmed = url.trim();

  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      return trimmed;
    }
  } catch {
    // ignore
  }

  return '#';
}

export function Markdown({ children }: MarkdownProps) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={[
          'p',
          'strong',
          'em',
          'ul',
          'ol',
          'li',
          'code',
          'pre',
          'a',
          'blockquote',
          'hr',
          'br',
        ]}
        unwrapDisallowed
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) => {
            const safeHref = href ? safeUrl(href) : '#';
            const isExternal =
              safeHref.startsWith('http://') || safeHref.startsWith('https://');

            return (
              <a
                href={safeHref}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

