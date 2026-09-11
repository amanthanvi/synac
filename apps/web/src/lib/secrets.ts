/**
 * Startup guard for the hashing salt the app depends on.
 *
 * Production must supply real, high-entropy salts: a predictable salt makes the
 * hashed rate-limit keys reversible (they are derived from client IPs, which is
 * a small enough space to brute force). Outside production we fall back to an
 * obviously-labelled development salt so `pnpm dev` and tests keep working,
 * but never to a bland literal like `'dev'`, which reads as a real value in
 * logs and could silently ship.
 */

const DEV_SALT_PREFIX = 'DEV-INSECURE-DO-NOT-USE-IN-PRODUCTION';

type SecretName = 'SYNAC_RATE_LIMIT_SALT';

/**
 * Resolve a salt. Throws in production when unset; otherwise returns a salt
 * whose value announces that it is a development placeholder.
 */
export function requireSalt(name: SecretName): string {
  const raw = process.env[name]?.trim();
  if (raw) return raw;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${name} is required in production. Generate one with \`openssl rand -hex 32\` and set it in the environment.`,
    );
  }

  return `${DEV_SALT_PREFIX}:${name}`;
}

/** Bearer secret for the worker -> web revalidation hook; null when unconfigured. */
export function getRevalidateSecret(): string | null {
  const raw = process.env.SYNAC_REVALIDATE_SECRET;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length >= 16 ? trimmed : null;
}
