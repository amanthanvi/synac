import styles from './Badge.module.css';
import type { ReactNode } from 'react';

export type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  return <span className={[styles.badge, className].filter(Boolean).join(' ')}>{children}</span>;
}
