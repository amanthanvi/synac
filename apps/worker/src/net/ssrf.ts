import net from 'node:net';

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

export function isForbiddenIp(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (!ipVersion) return true;

  if (ipVersion === 4) {
    const o = parseIpv4(address);
    if (!o) return true;
    const [a, b] = o;

    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 127.0.0.0/8 loopback
    if (a === 127) return true;
    // 169.254.0.0/16 link-local
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 198.18.0.0/15 (benchmark)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 224.0.0.0/4 multicast
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 reserved
    if (a >= 240) return true;

    return false;
  }

  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true; // unspecified / loopback
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique-local (fc00::/7)
  if (normalized.startsWith('ff')) return true; // multicast
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.slice('::ffff:'.length);
    return isForbiddenIp(v4);
  }

  return false;
}

export function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost') return true;
  if (h.endsWith('.local')) return true;
  if (!h.includes('.')) return true;
  return false;
}

export function isAllowedHostname(hostname: string, allowedHosts: string[]): boolean {
  const h = hostname.trim().toLowerCase();
  return allowedHosts.some((allowed) => {
    const a = allowed.trim().toLowerCase();
    return h === a || h.endsWith(`.${a}`);
  });
}

