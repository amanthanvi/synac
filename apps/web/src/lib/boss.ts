import { PgBoss } from 'pg-boss';

type GlobalForBoss = typeof globalThis & {
  __synacBoss?: PgBoss;
  __synacBossStartPromise?: Promise<PgBoss>;
};

export async function getBoss(): Promise<PgBoss> {
  const globalForBoss = globalThis as GlobalForBoss;

  if (globalForBoss.__synacBoss) return globalForBoss.__synacBoss;
  if (globalForBoss.__synacBossStartPromise) return globalForBoss.__synacBossStartPromise;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to start pg-boss');

  globalForBoss.__synacBossStartPromise = (async () => {
    const boss = new PgBoss(databaseUrl);
    await boss.start();
    globalForBoss.__synacBoss = boss;
    return boss;
  })();

  return globalForBoss.__synacBossStartPromise;
}
