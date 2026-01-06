import styles from './Pill.module.css';
import type { ReactNode } from 'react';

export type PillProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
};

export function Pill({ children, active, className }: PillProps) {
  return (
    <span
      className={[styles.pill, active ? styles.active : undefined, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
