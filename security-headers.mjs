// Centralized security header configuration used by the production server (and optionally by tooling)

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
  'block-all-mixed-content',
].join('; ');

export const PERMISSIONS_POLICY =
  'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()';

export const COOP = 'same-origin';
export const CORP = 'same-origin';
export const COEP = 'require-corp';

// Optional helper to build a header map if needed elsewhere (e.g., for tooling).
export function buildSecurityHeaders({ coepOn = true } = {}) {
  return {
    'Content-Security-Policy': CSP,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Cross-Origin-Opener-Policy': COOP,
    'Cross-Origin-Resource-Policy': CORP,
    ...(coepOn ? { 'Cross-Origin-Embedder-Policy': COEP } : {}),
    'Origin-Agent-Cluster': '?1',
    'X-DNS-Prefetch-Control': 'off',
  };
}
