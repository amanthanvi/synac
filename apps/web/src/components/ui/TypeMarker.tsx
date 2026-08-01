import styles from './TypeMarker.module.css';

export function TypeMarker({
  type,
  className,
}: {
  type: 'TERM' | 'ACRONYM';
  className?: string;
}) {
  return (
    <span className={className ? `${styles.marker} ${className}` : styles.marker}>
      {type === 'TERM' ? 'term' : 'acronym'}
    </span>
  );
}
