import styles from './TypeBadge.module.css';

type TypeBadgeProps = {
  entryType: 'TERM' | 'ACRONYM';
  size?: 'sm' | 'md';
};

/**
 * The TERM/ACRONYM chip. One tinted-outline treatment everywhere: solid
 * accent fills could not hold a 4.5:1 contrast ratio against white text.
 */
export function TypeBadge({ entryType, size = 'sm' }: TypeBadgeProps) {
  return (
    <span
      className={[
        styles.badge,
        entryType === 'TERM' ? styles.term : styles.acronym,
        size === 'md' ? styles.md : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {entryType}
    </span>
  );
}
