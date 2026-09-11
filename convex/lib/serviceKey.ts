/**
 * Auth for the anonymous runtime mutations (currently only rate limiting):
 * only the Next.js server holds SYNAC_CONVEX_SERVICE_KEY, so these mutations
 * cannot be driven directly from the open internet even though they are part
 * of the public function API.
 *
 * Both sides are hashed before comparison so the compared buffers are always
 * 32 bytes: the loop then runs in time independent of the secret's length and
 * of how far a guess matches, which a direct character walk cannot promise.
 */
export async function requireServiceKey(provided: string): Promise<void> {
  const secret = process.env.SYNAC_CONVEX_SERVICE_KEY;
  if (!secret)
    throw new Error(
      'SYNAC_CONVEX_SERVICE_KEY is not configured on this deployment',
    );
  const [providedDigest, secretDigest] = await Promise.all([
    digest(provided),
    digest(secret),
  ]);
  let difference = 0;
  for (let index = 0; index < secretDigest.length; index += 1) {
    difference |= (providedDigest[index] ?? 0) ^ (secretDigest[index] ?? 0);
  }
  if (difference !== 0) throw new Error('Unauthorized');
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
