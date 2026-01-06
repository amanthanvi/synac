import { UserButton } from '@clerk/nextjs';

import { requireAdminActor } from '@/lib/admin';
import { ButtonLink } from '@/components/ui/Button';

import layoutStyles from '../_styles/Layout.module.css';
import styles from './layout.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminActor();

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <nav className={styles.nav} aria-label="Admin">
          <ButtonLink href="/admin" size="sm">
            Dashboard
          </ButtonLink>
          <ButtonLink href="/admin/entries" size="sm">
            Entries
          </ButtonLink>
          <ButtonLink href="/admin/sources" size="sm">
            Sources
          </ButtonLink>
          <ButtonLink href="/admin/tags" size="sm">
            Tags
          </ButtonLink>
          <ButtonLink href="/admin/ingest" size="sm">
            Ingest
          </ButtonLink>
          <ButtonLink href="/admin/takedown" size="sm">
            Takedown
          </ButtonLink>
          <ButtonLink href="/admin/audit" size="sm">
            Audit
          </ButtonLink>
        </nav>

        <div className={styles.actor}>
          <div className={`${layoutStyles.muted} ${layoutStyles.small} ${layoutStyles.mono}`}>
            {actor.email} · {actor.roleNames.join(', ')}
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>

      {children}
    </div>
  );
}
