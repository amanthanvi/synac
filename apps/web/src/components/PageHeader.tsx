import styles from './PageHeader.module.css';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** @deprecated retained for call-site compatibility; no longer rendered. */
  badge?: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
