import styles from './KeyValue.module.css';
import type { ReactNode } from 'react';

export type KeyValueItemProps = {
  label: string;
  value: ReactNode;
};

export type KeyValueListProps = {
  items: KeyValueItemProps[];
  className?: string;
};

export function KeyValueList({ items, className }: KeyValueListProps) {
  return (
    <div className={[styles.list, className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <div className={styles.key}>{item.label}</div>
          <div className={styles.value}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
