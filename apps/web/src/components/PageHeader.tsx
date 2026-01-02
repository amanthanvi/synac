import styles from './PageHeader.module.css';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
};

export function PageHeader({ title, subtitle, badge }: PageHeaderProps) {
  return (
    <header className={styles.wrap}>
      {badge ? <div className={styles.badge}>{badge}</div> : null}
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}

