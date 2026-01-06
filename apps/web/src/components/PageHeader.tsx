import styles from './PageHeader.module.css';
import { Badge } from './ui/Badge';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
};

export function PageHeader({ title, subtitle, badge }: PageHeaderProps) {
  return (
    <header className={styles.wrap}>
      {badge ? <Badge>{badge}</Badge> : null}
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
