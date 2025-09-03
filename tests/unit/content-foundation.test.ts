import { describe, it, expect } from 'vitest';

const FOUNDATION_SLUGS = [
  'aead',
  'aes',
  'aitm',
  'authentication',
  'authorization',
  'certificate-revocation-list',
  'certificate-transparency',
  'dns',
  'doh',
  'dnssec',
  'ecdsa',
  'ed25519',
  'gcm',
  'hard-coded-credentials',
  'hkdf',
  'hmac',
  'hsts',
  'http-semantics',
  'http2',
  'http3',
  'improper-authentication',
  'insecure-deserialization',
  'insufficient-entropy',
  'ipv6',
  'jwe',
  'jwk',
  'jws',
  'jwt',
  'kdf',
  'missing-authorization',
  'mutual-tls',
  'oauth2',
  'ocsp',
  'ocsp-stapling',
  'open-redirect',
  'openid-connect',
  'path-traversal',
  'pbkdf2',
  'pfs',
  'pkce',
  'quic',
  'replay-attack',
  'rsa',
  'sha-256',
  'sql-injection',
  'ssrf',
  'udp',
  'x509-certificate',
  'xxe',
];

function extractFrontmatter(raw: string): string {
  const m = raw.match(/^---[\r\n]+([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

function getScalar(front: string, key: string): string | undefined {
  const re = new RegExp(
    '^' + key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ':\\s*[\'\\"]?(.+?)[\'\\"]?\\s*$',
    'm',
  );
  const m = front.match(re);
  return m ? m[1].trim() : undefined;
}

function getBlock(front: string, key: string): string {
  const lines = front.split(/\r?\n/);
  let started = false;
  const buf: string[] = [];
  for (const line of lines) {
    if (!started) {
      if (new RegExp('^' + key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ':\\s*$').test(line)) {
        started = true;
      }
    } else {
      if (/^[A-Za-z][\w-]*:\s*$/.test(line)) break;
      buf.push(line);
    }
  }
  return buf.join('\n');
}

describe('content foundation guardrails (MDX frontmatter)', () => {
  const files = import.meta.glob('../../src/content/terms/*.mdx', {
    as: 'raw',
    eager: true,
  }) as Record<string, string>;

  it('each foundation entry meets summary, sources(1-3), mappings-keys, and updatedAt ISO', () => {
    const paths = Object.keys(files);
    for (const slug of FOUNDATION_SLUGS) {
      const match = paths.find((p) => p.endsWith(`/terms/${slug}.mdx`));
      expect(match, `Missing file for slug: ${slug}`).toBeTruthy();
      const raw = files[match!];
      const front = extractFrontmatter(raw);

      // summary length ≤ 240
      const summary = getScalar(front, 'summary');
      expect(summary, `missing summary for ${slug}`).toBeTruthy();
      expect((summary as string).length, `summary too long for ${slug}`).toBeLessThanOrEqual(240);

      // sources: 1–3 items, each with citation and url, and optional normative boolean
      const sourcesBlock = getBlock(front, 'sources');
      const itemCount =
        (sourcesBlock.match(/\n\s*-\s+/g) || []).length ||
        (sourcesBlock.trim().startsWith('- ') ? 1 : 0);
      expect(itemCount, `sources count out of range for ${slug}`).toBeGreaterThanOrEqual(1);
      expect(itemCount, `sources count out of range for ${slug}`).toBeLessThanOrEqual(3);
      expect(
        (sourcesBlock.match(/citation:\s*.+/g) || []).length,
        `missing citation in sources for ${slug}`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        (sourcesBlock.match(/url:\s*.+/g) || []).length,
        `missing url in sources for ${slug}`,
      ).toBeGreaterThanOrEqual(1);

      // mappings keys limited when present
      const mappingsBlock = getBlock(front, 'mappings');
      if (mappingsBlock && mappingsBlock.trim().length) {
        const keys = (mappingsBlock.match(/^\s{2}([A-Za-z][\w-]*):/gm) || []).map((k) =>
          k.trim().replace(/:$/, ''),
        );
        const allowed = new Set(['attack', 'cweIds', 'capecIds', 'examDomains']);
        for (const k of keys) {
          expect(allowed.has(k), `unsupported mappings key '${k}' in ${slug}`).toBeTruthy();
        }
      }

      // updatedAt is ISO datetime (YYYY-MM-DDTHH:MM:SS.mmmZ)
      const updatedAt = getScalar(front, 'updatedAt');
      expect(updatedAt, `missing updatedAt for ${slug}`).toBeTruthy();
      expect(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt as string),
        `updatedAt not ISO for ${slug}`,
      ).toBeTruthy();

      // Assert updatedAt is not in the future
      const updatedAtDate = new Date(updatedAt as string);
      expect(!isNaN(updatedAtDate.getTime()), `updatedAt not parsable for ${slug}`).toBeTruthy();
      expect(updatedAtDate.getTime() <= Date.now(), `updatedAt is in the future for ${slug}`).toBeTruthy();
    }
  });
});
