/**
 * Auth for the anonymous runtime mutations (view tracking, rate limiting):
 * only the Next.js server holds SYNAC_CONVEX_SERVICE_KEY, so these mutations
 * cannot be driven directly from the open internet even though they are part
 * of the public function API.
 */
export function requireServiceKey(provided: string): void {
  const secret = process.env.SYNAC_CONVEX_SERVICE_KEY;
  if (!secret) throw new Error("SYNAC_CONVEX_SERVICE_KEY is not configured on this deployment");
  if (!constantTimeEquals(provided, secret)) throw new Error("Unauthorized");
}

function constantTimeEquals(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}
