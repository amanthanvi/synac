import styles from './Panel.module.css';
import type { ReactNode } from 'react';

export type PanelProps = {
  as?: 'div' | 'section' | 'article';
  className?: string;
  children: ReactNode;
};

export function Panel({ as: Tag = 'div', className, children }: PanelProps) {
  return <Tag className={[styles.panel, className].filter(Boolean).join(' ')}>{children}</Tag>;
}
