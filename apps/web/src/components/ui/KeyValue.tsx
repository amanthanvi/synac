import styles from './KeyValue.module.css';
import type { ReactNode } from 'react';

type KeyValueItemProps = {
  label: string;
  value: ReactNode;
};

type KeyValueListProps = {
  items: KeyValueItemProps[];
};

export function KeyValueList({ items }: KeyValueListProps) {
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <div className={styles.key}>{item.label}</div>
          <div className={styles.value}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
