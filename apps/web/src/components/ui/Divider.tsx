import styles from './Divider.module.css';
import type { ComponentProps } from 'react';

export type DividerProps = ComponentProps<'hr'> & {
  className?: string;
};

export function Divider({ className, ...props }: DividerProps) {
  return <hr {...props} className={[styles.divider, className].filter(Boolean).join(' ')} />;
}
