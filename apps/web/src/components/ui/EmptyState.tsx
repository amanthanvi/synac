import styles from './EmptyState.module.css';
import type { ReactNode } from 'react';

export type EmptyStateProps = {
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function EmptyState({ title, children, actions, className }: EmptyStateProps) {
  return (
    <section className={[styles.empty, className].filter(Boolean).join(' ')}>
      {title ? <div className={styles.title}>{title}</div> : null}
      {children ? <div className={styles.body}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
