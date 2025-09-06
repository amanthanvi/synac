export type PopularItem = {
  label: string;
  q: string;
  sources?: string;
  types?: string;
};

export const popularSearches: PopularItem[] = [
  { label: 'TLS', q: 'tls', sources: 'RFC', types: 'protocol' },
  { label: 'JWT', q: 'jwt', sources: 'RFC' },
  { label: 'OAuth 2.0', q: 'oauth2' },
  { label: 'XSS', q: 'xss', types: 'vulnerability' },
  { label: 'mTLS', q: 'mtls', types: 'protocol' },
  { label: 'QUIC', q: 'quic', types: 'protocol' },
  { label: 'PKI', q: 'pki' },
  { label: 'X.509', q: 'x509' },
  { label: 'DoS', q: 'dos', types: 'vulnerability' },
  { label: 'CSRF', q: 'csrf', types: 'vulnerability' },
];
