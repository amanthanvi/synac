import { PgBoss } from 'pg-boss';

type GlobalForBoss = typeof globalThis & {
  __synacBoss?: PgBoss;
  __synacBossStartPromise?: Promise<PgBoss>;
  __synacBossByUrl?: Map<string, PgBoss>;
  __synacBossStartPromiseByUrl?: Map<string, Promise<PgBoss>>;
};

export async function getBossForDatabaseUrl(databaseUrl: string): Promise<PgBoss> {
  const globalForBoss = globalThis as GlobalForBoss;

  if (!globalForBoss.__synacBossByUrl) globalForBoss.__synacBossByUrl = new Map<string, PgBoss>();
  if (!globalForBoss.__synacBossStartPromiseByUrl) {
    globalForBoss.__synacBossStartPromiseByUrl = new Map<string, Promise<PgBoss>>();
  }

  const existing = globalForBoss.__synacBossByUrl.get(databaseUrl);
  if (existing) return existing;

  const inFlight = globalForBoss.__synacBossStartPromiseByUrl.get(databaseUrl);
  if (inFlight) return inFlight;

  const startPromise = (async () => {
    const boss = new PgBoss(databaseUrl);
    await boss.start();
    globalForBoss.__synacBossByUrl!.set(databaseUrl, boss);
    return boss;
  })();

  globalForBoss.__synacBossStartPromiseByUrl.set(databaseUrl, startPromise);
  return startPromise;
}

export async function getBoss(): Promise<PgBoss> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to start pg-boss');
  return getBossForDatabaseUrl(databaseUrl);
}
