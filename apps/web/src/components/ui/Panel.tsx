import styles from './Panel.module.css';
import type { ReactNode } from 'react';

type PanelProps = {
  className?: string;
  children: ReactNode;
};

export function Panel({ className, children }: PanelProps) {
  return (
    <div className={[styles.panel, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
