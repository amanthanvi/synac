#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function isoMidnightUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00.000Z`;
}
const UPDATED_AT = isoMidnightUTC();

function ensureFile(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
}
function q(s) {
  return String(s).replace(/'/g, "''");
}
function frontmatter(entry) {
  const { id, term, summary, tags, sources, mappings } = entry;
  const lines = [];
  lines.push('---');
  lines.push(`id: '${q(id)}'`);
  lines.push(`term: '${q(term)}'`);
  lines.push(`summary: '${q(summary)}'`);
  lines.push(`tags: [${(tags || []).map((t) => `'${q(t)}'`).join(', ')}]`);
  lines.push('sources:');
  for (const s of sources || []) {
    lines.push(`  - kind: '${q(s.kind)}'`);
    lines.push(`    citation: '${q(s.citation)}'`);
    lines.push(`    url: '${q(s.url)}'`);
    if (typeof s.normative === 'boolean') {
      lines.push(`    normative: ${s.normative ? 'true' : 'false'}`);
    }
    if (s.date) lines.push(`    date: '${q(s.date)}'`);
    if (s.excerpt) lines.push(`    excerpt: '${q(s.excerpt)}'`);
  }
  if (mappings && Object.keys(mappings).length) {
    lines.push('mappings:');
    if (mappings.attack) {
      lines.push('  attack:');
      if (mappings.attack.tactic) lines.push(`    tactic: '${q(mappings.attack.tactic)}'`);
      if (Array.isArray(mappings.attack.techniqueIds) && mappings.attack.techniqueIds.length) {
        lines.push(
          '    techniqueIds: [' +
            mappings.attack.techniqueIds.map((x) => `'${q(x)}'`).join(', ') +
            ']',
        );
      }
    }
    if (Array.isArray(mappings.cweIds) && mappings.cweIds.length) {
      lines.push('  cweIds: [' + mappings.cweIds.map((x) => `'${q(x)}'`).join(', ') + ']');
    }
    if (Array.isArray(mappings.capecIds) && mappings.capecIds.length) {
      lines.push('  capecIds: [' + mappings.capecIds.map((x) => `'${q(x)}'`).join(', ') + ']');
    }
    if (Array.isArray(mappings.examDomains) && mappings.examDomains.length) {
      lines.push(
        '  examDomains: [' + mappings.examDomains.map((x) => `'${q(x)}'`).join(', ') + ']',
      );
    }
  }
  lines.push(`updatedAt: '${UPDATED_AT}'`);
  lines.push('---');
  return lines.join('\n');
}
function mdx(entry) {
  return frontmatter(entry) + '\n' + (entry.body || '') + '\n';
}

const entries = JSON.parse(`
[
  {
    "id": "aead",
    "term": "AEAD (Authenticated Encryption with Associated Data)",
    "summary": "AEAD provides confidentiality and integrity for a message and authenticates optional associated data that is not encrypted.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 5116", "url": "https://www.rfc-editor.org/rfc/rfc5116", "normative": true }
    ],
    "body": "AEAD binds associated data to the ciphertext so tampering is detectable. Common constructions include GCM and CCM."
  },
  {
    "id": "aes",
    "term": "AES (Advanced Encryption Standard)",
    "summary": "AES is a NIST-standardized block cipher with 128-bit blocks and key sizes of 128, 192, or 256 bits.",
    "tags": ["crypto","nist"],
    "sources": [
      { "kind": "NIST", "citation": "FIPS 197", "url": "https://csrc.nist.gov/publications/detail/fips/197/final", "normative": true }
    ],
    "body": "AES is widely deployed in protocols and storage. Secure use depends on approved modes and sound key management."
  },
  {
    "id": "aitm",
    "term": "Adversary-in-the-Middle (AiTM)",
    "summary": "AiTM interposes on a communication path to intercept, relay, or modify traffic between parties.",
    "tags": ["network","capec"],
    "sources": [
      { "kind": "CAPEC", "citation": "CAPEC-94", "url": "https://capec.mitre.org/data/definitions/94.html", "normative": true }
    ],
    "mappings": { "capecIds": ["CAPEC-94"] },
    "body": "Strong authentication, TLS with HSTS, and certificate validation reduce exposure to interception and relaying."
  },
  {
    "id": "authentication",
    "term": "Authentication",
    "summary": "Authentication verifies the identity of a user, process, or device before granting access to resources.",
    "tags": ["identity","nist"],
    "sources": [
      { "kind": "NIST", "citation": "NIST CSRC Glossary — Authentication", "url": "https://csrc.nist.gov/glossary/term/authentication", "normative": true }
    ],
    "body": "NIST describes factors such as knowledge, possession, and inherence; multi‑factor approaches increase assurance."
  },
  {
    "id": "authorization",
    "term": "Authorization",
    "summary": "Authorization grants or denies specific permissions to an authenticated subject for accessing resources.",
    "tags": ["identity","nist"],
    "sources": [
      { "kind": "NIST", "citation": "NIST CSRC Glossary — Authorization", "url": "https://csrc.nist.gov/glossary/term/authorization", "normative": true }
    ],
    "body": "Policy‑driven decisions (e.g., role‑ or attribute‑based) determine permitted actions on protected resources."
  },
  {
    "id": "certificate-transparency",
    "term": "Certificate Transparency (CT)",
    "summary": "CT logs issued TLS certificates in public append‑only logs to detect and deter misissuance.",
    "tags": ["pki","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 6962", "url": "https://www.rfc-editor.org/rfc/rfc6962", "normative": true }
    ],
    "body": "Public logs and monitors enable ecosystem oversight; browsers may require SCTs for trust."
  },
  {
    "id": "certificate-revocation-list",
    "term": "Certificate Revocation List (CRL)",
    "summary": "A CRL is a CA‑signed, time‑stamped list of revoked certificates published for relying parties.",
    "tags": ["pki","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 5280", "url": "https://www.rfc-editor.org/rfc/rfc5280", "normative": true }
    ],
    "body": "CRLs distribute revocation information; OCSP can provide fresher, query‑based status."
  },
  {
    "id": "dns",
    "term": "Domain Name System (DNS)",
    "summary": "DNS maps human‑readable names to IP addresses and other records via a distributed, hierarchical database.",
    "tags": ["network","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 1035", "url": "https://www.rfc-editor.org/rfc/rfc1035", "normative": true }
    ],
    "body": "Security extensions (DNSSEC) and transports like DoH enhance integrity and privacy properties."
  },
  {
    "id": "doh",
    "term": "DNS over HTTPS (DoH)",
    "summary": "DoH carries DNS queries over HTTPS to protect against on‑path observation and manipulation.",
    "tags": ["network","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8484", "url": "https://www.rfc-editor.org/rfc/rfc8484", "normative": true }
    ],
    "body": "By using HTTPS, DoH leverages TLS and HTTP semantics while relying on trusted resolvers."
  },
  {
    "id": "dnssec",
    "term": "DNS Security Extensions (DNSSEC)",
    "summary": "DNSSEC adds digital signatures to DNS data, providing origin authentication and integrity to prevent cache poisoning.",
    "tags": ["network","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 4033", "url": "https://www.rfc-editor.org/rfc/rfc4033", "normative": true }
    ],
    "body": "A chain of trust from the root enables validators to detect tampered or spoofed DNS responses."
  },
  {
    "id": "ecdsa",
    "term": "Elliptic Curve Digital Signature Algorithm (ECDSA)",
    "summary": "ECDSA is a digital signature algorithm based on elliptic curve cryptography, offering shorter keys for comparable security.",
    "tags": ["crypto","signatures","nist"],
    "sources": [
      { "kind": "NIST", "citation": "FIPS 186-4", "url": "https://csrc.nist.gov/publications/detail/fips/186/4/final", "normative": true }
    ],
    "body": "Security requires correct parameter selection and high‑quality randomness in nonce generation."
  },
  {
    "id": "ed25519",
    "term": "Ed25519",
    "summary": "Ed25519 is an EdDSA signature scheme using Curve25519 designed for high performance and robust security.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8032", "url": "https://www.rfc-editor.org/rfc/rfc8032", "normative": true }
    ],
    "body": "Deterministic signatures and sound implementations make Ed25519 a modern default for signatures."
  },
  {
    "id": "gcm",
    "term": "Galois/Counter Mode (GCM)",
    "summary": "GCM is an AEAD mode that provides confidentiality and integrity via counter‑mode encryption and a Galois‑field MAC.",
    "tags": ["crypto","aead","nist"],
    "sources": [
      { "kind": "NIST", "citation": "SP 800-38D", "url": "https://csrc.nist.gov/publications/detail/sp/800-38d/final", "normative": true }
    ],
    "body": "Strict nonce uniqueness is critical; reuse catastrophically compromises confidentiality and integrity."
  },
  {
    "id": "hmac",
    "term": "HMAC (Hash-based Message Authentication Code)",
    "summary": "HMAC uses a cryptographic hash with a secret key to provide message integrity and authentication.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 2104", "url": "https://www.rfc-editor.org/rfc/rfc2104", "normative": true }
    ],
    "body": "HMAC with standard hashes such as SHA‑256 remains widely deployed and robust in protocols and APIs."
  },
  {
    "id": "hsts",
    "term": "HTTP Strict Transport Security (HSTS)",
    "summary": "HSTS tells browsers to only connect to a site over HTTPS for a specified time, mitigating downgrade attacks.",
    "tags": ["web","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 6797", "url": "https://www.rfc-editor.org/rfc/rfc6797", "normative": true }
    ],
    "body": "Preload lists and correct max‑age settings help enforce HTTPS and reduce cookie‑hijacking risk."
  },
  {
    "id": "hkdf",
    "term": "HKDF (HMAC-based Key Derivation Function)",
    "summary": "HKDF extracts and expands keying material using HMAC to derive cryptographic keys.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 5869", "url": "https://www.rfc-editor.org/rfc/rfc5869", "normative": true }
    ],
    "body": "HKDF separates entropy extraction from expansion and supports context binding via salt and info inputs."
  },
  {
    "id": "http-semantics",
    "term": "HTTP Semantics",
    "summary": "HTTP semantics define methods, status codes, header fields, and message structure independent of transport.",
    "tags": ["web","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 9110", "url": "https://www.rfc-editor.org/rfc/rfc9110", "normative": true }
    ],
    "body": "These semantics apply across mappings such as HTTP/1.1, HTTP/2, and HTTP/3."
  },
  {
    "id": "http2",
    "term": "HTTP/2",
    "summary": "HTTP/2 introduces multiplexing, header compression, and prioritization to improve performance over HTTP/1.1.",
    "tags": ["web","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 9113", "url": "https://www.rfc-editor.org/rfc/rfc9113", "normative": true }
    ],
    "body": "It changes framing atop a reliable transport, typically TLS over TCP, while preserving HTTP semantics."
  },
  {
    "id": "http3",
    "term": "HTTP/3",
    "summary": "HTTP/3 maps HTTP semantics onto QUIC to avoid head‑of‑line blocking and support connection migration.",
    "tags": ["web","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 9114", "url": "https://www.rfc-editor.org/rfc/rfc9114", "normative": true }
    ],
    "body": "By running over QUIC (UDP‑based), HTTP/3 reduces latency and improves reliability under loss."
  },
  {
    "id": "ipv6",
    "term": "Internet Protocol Version 6 (IPv6)",
    "summary": "IPv6 provides a 128‑bit address space and simplified headers with support for extensions and mandatory IPsec.",
    "tags": ["network","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8200", "url": "https://www.rfc-editor.org/rfc/rfc8200", "normative": true }
    ],
    "body": "Deployment includes dual‑stack and transition mechanisms; larger address space eases aggregation."
  },
  {
    "id": "jwe",
    "term": "JSON Web Encryption (JWE)",
    "summary": "JWE defines a compact, URL‑safe representation for encrypted content using JOSE algorithms.",
    "tags": ["tokens","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 7516", "url": "https://www.rfc-editor.org/rfc/rfc7516", "normative": true }
    ],
    "body": "It supports multiple recipients and encapsulates headers, ciphertext, and authentication data."
  },
  {
    "id": "jwk",
    "term": "JSON Web Key (JWK)",
    "summary": "JWK is a JSON data structure that represents cryptographic keys, including type and use parameters.",
    "tags": ["keys","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 7517", "url": "https://www.rfc-editor.org/rfc/rfc7517", "normative": true }
    ],
    "body": "JWKS endpoints expose key sets for verification and rotation."
  },
  {
    "id": "jws",
    "term": "JSON Web Signature (JWS)",
    "summary": "JWS defines a compact format for integrity‑protected content with digital signatures or MACs.",
    "tags": ["tokens","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 7515", "url": "https://www.rfc-editor.org/rfc/rfc7515", "normative": true }
    ],
    "body": "Verification checks algorithm and key selection; payloads may be detached or embedded."
  },
  {
    "id": "jwt",
    "term": "JSON Web Token (JWT)",
    "summary": "JWT is a compact, URL‑safe token for conveying claims between parties, often signed and optionally encrypted.",
    "tags": ["auth","tokens","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 7519", "url": "https://www.rfc-editor.org/rfc/rfc7519", "normative": true }
    ],
    "body": "Correct issuer, audience, lifetime, and algorithm validation are essential to prevent misuse."
  },
  {
    "id": "kdf",
    "term": "Key Derivation Functions (NIST SP 800-108)",
    "summary": "SP 800‑108 specifies KDFs based on pseudorandom functions to derive one or more keys from a master secret.",
    "tags": ["crypto","nist"],
    "sources": [
      { "kind": "NIST", "citation": "SP 800-108", "url": "https://csrc.nist.gov/publications/detail/sp/800-108/final", "normative": true }
    ],
    "body": "Counter, feedback, and pipeline modes support diverse contexts; labels bind derived keys to uses."
  },
  {
    "id": "mutual-tls",
    "term": "Mutual TLS (TLS Client Authentication)",
    "summary": "Mutual TLS requires clients to present certificates, enabling strong transport‑layer authentication.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8446", "url": "https://www.rfc-editor.org/rfc/rfc8446", "normative": true }
    ],
    "body": "Client certificates bind connections to identities; deployment involves issuing client certs and configuring trust anchors."
  },
  {
    "id": "oauth2",
    "term": "OAuth 2.0",
    "summary": "OAuth 2.0 is an authorization framework enabling limited access to HTTP resources on behalf of a resource owner.",
    "tags": ["auth","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 6749", "url": "https://www.rfc-editor.org/rfc/rfc6749", "normative": true }
    ],
    "body": "It defines roles and grant types; best practices include PKCE and sender‑constrained tokens."
  },
  {
    "id": "ocsp",
    "term": "Online Certificate Status Protocol (OCSP)",
    "summary": "OCSP lets clients query a responder for the revocation status of an X.509 certificate.",
    "tags": ["pki","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 6960", "url": "https://www.rfc-editor.org/rfc/rfc6960", "normative": true }
    ],
    "body": "OCSP provides timely status compared to CRLs; stapling improves privacy and performance."
  },
  {
    "id": "ocsp-stapling",
    "term": "OCSP Stapling (Certificate Status Request)",
    "summary": "OCSP stapling lets a TLS server provide a signed OCSP response during handshake to prove certificate status.",
    "tags": ["pki","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 6066 §8", "url": "https://www.rfc-editor.org/rfc/rfc6066#section-8", "normative": true }
    ],
    "body": "Stapling reduces client‑responder traffic and mitigates privacy leaks by delivering status via the server."
  },
  {
    "id": "openid-connect",
    "term": "OpenID Connect (OIDC)",
    "summary": "OIDC is an identity layer on top of OAuth 2.0 that allows clients to verify end‑user identity and obtain profile data.",
    "tags": ["auth","tokens","other"],
    "sources": [
      { "kind": "OTHER", "citation": "OpenID Connect Core 1.0", "url": "https://openid.net/specs/openid-connect-core-1_0.html", "normative": true }
    ],
    "body": "It standardizes ID tokens and discovery/registration for interoperable sign‑in across providers."
  },
  {
    "id": "pbkdf2",
    "term": "PBKDF2",
    "summary": "PBKDF2 derives keys from passwords using a pseudorandom function with salt and iteration count.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8018", "url": "https://www.rfc-editor.org/rfc/rfc8018", "normative": true }
    ],
    "body": "Adequate iterations and unique salts resist brute‑force; memory‑hard alternatives may be preferred."
  },
  {
    "id": "pfs",
    "term": "Perfect Forward Secrecy (PFS)",
    "summary": "PFS ensures that compromise of long‑term keys does not compromise past session keys derived via ephemeral key exchange.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8446", "url": "https://www.rfc-editor.org/rfc/rfc8446", "normative": true }
    ],
    "body": "TLS 1.3 mandates ephemeral (EC)DHE, providing forward secrecy by deriving unique keys per session."
  },
  {
    "id": "pkce",
    "term": "Proof Key for Code Exchange (PKCE)",
    "summary": "PKCE augments OAuth 2.0 authorization code flow with a verifier and challenge to mitigate interception attacks.",
    "tags": ["auth","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 7636", "url": "https://www.rfc-editor.org/rfc/rfc7636", "normative": true }
    ],
    "body": "Recommended for public clients; S256 is the preferred code challenge method."
  },
  {
    "id": "quic",
    "term": "QUIC",
    "summary": "QUIC is a UDP‑based, multiplexed and secure transport protocol providing low‑latency connections with built‑in TLS 1.3.",
    "tags": ["network","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 9000", "url": "https://www.rfc-editor.org/rfc/rfc9000", "normative": true }
    ],
    "body": "Connection migration and lack of head‑of‑line blocking improve performance versus TCP."
  },
  {
    "id": "rsa",
    "term": "RSA",
    "summary": "RSA is a public‑key cryptosystem used for encryption and digital signatures, based on the difficulty of integer factorization.",
    "tags": ["crypto","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 8017", "url": "https://www.rfc-editor.org/rfc/rfc8017", "normative": true }
    ],
    "body": "Prefer RSA‑PSS for signatures and OAEP for encryption; adequate key sizes and padding are essential."
  },
  {
    "id": "sha-256",
    "term": "SHA-256",
    "summary": "SHA‑256 is a 256‑bit cryptographic hash function from the SHA‑2 family standardized by NIST.",
    "tags": ["crypto","nist"],
    "sources": [
      { "kind": "NIST", "citation": "FIPS 180-4", "url": "https://csrc.nist.gov/publications/detail/fips/180/4/final", "normative": true }
    ],
    "body": "It provides preimage and collision resistance for integrity and is used in HMAC, signatures, and commitments."
  },
  {
    "id": "sql-injection",
    "term": "SQL Injection",
    "summary": "SQL Injection occurs when untrusted input is concatenated into SQL queries, enabling execution of unintended commands.",
    "tags": ["appsec","cwe","capec"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-89", "url": "https://cwe.mitre.org/data/definitions/89.html", "normative": true },
      { "kind": "CAPEC", "citation": "CAPEC-66", "url": "https://capec.mitre.org/data/definitions/66.html", "normative": false }
    ],
    "mappings": { "cweIds": ["CWE-89"], "capecIds": ["CAPEC-66"] },
    "body": "Use parameterized queries, least privilege, and input validation to prevent injection."
  },
  {
    "id": "ssrf",
    "term": "Server-Side Request Forgery (SSRF)",
    "summary": "SSRF makes the server initiate requests to internal or external resources, often bypassing network access controls.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-918", "url": "https://cwe.mitre.org/data/definitions/918.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-918"] },
    "body": "Mitigate with strict allowlists, metadata service protections, and egress controls."
  },
  {
    "id": "xxe",
    "term": "XML External Entity (XXE)",
    "summary": "XXE arises when XML parsers process external entity references, enabling file disclosure or SSRF.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-611", "url": "https://cwe.mitre.org/data/definitions/611.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-611"] },
    "body": "Disable external entity resolution and use secure parser configurations or alternative formats."
  },
  {
    "id": "path-traversal",
    "term": "Path Traversal",
    "summary": "Path traversal accesses files outside intended directories by manipulating path inputs.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-22", "url": "https://cwe.mitre.org/data/definitions/22.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-22"] },
    "body": "Normalize and validate paths, avoid mixing user input with filesystem operations, and enforce allowlists."
  },
  {
    "id": "insecure-deserialization",
    "term": "Insecure Deserialization",
    "summary": "Insecure deserialization occurs when untrusted data is deserialized, enabling code execution or logic manipulation.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-502", "url": "https://cwe.mitre.org/data/definitions/502.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-502"] },
    "body": "Avoid deserializing untrusted data and use safe formats; enforce integrity checks and type constraints."
  },
  {
    "id": "improper-authentication",
    "term": "Improper Authentication",
    "summary": "Improper authentication occurs when identity checks fail or can be bypassed, allowing unauthorized access.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-287", "url": "https://cwe.mitre.org/data/definitions/287.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-287"] },
    "body": "Weak checks, default credentials, or flawed flows commonly lead to improper authentication."
  },
  {
    "id": "missing-authorization",
    "term": "Missing Authorization",
    "summary": "Missing authorization occurs when access control checks are absent or insufficient after authentication.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-862", "url": "https://cwe.mitre.org/data/definitions/862.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-862"] },
    "body": "Enforce authorization for every request using consistent server‑side checks; prefer deny‑by‑default policies."
  },
  {
    "id": "hard-coded-credentials",
    "term": "Hard-coded Credentials",
    "summary": "Embedding credentials directly in code or binaries creates a persistent risk of unauthorized access when exposed.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-798", "url": "https://cwe.mitre.org/data/definitions/798.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-798"] },
    "body": "Externalize secrets, use secret stores, and rotate credentials to reduce exposure."
  },
  {
    "id": "insufficient-entropy",
    "term": "Insufficient Entropy",
    "summary": "Using predictable or low‑entropy values for keys, tokens, or nonces undermines cryptographic strength.",
    "tags": ["crypto","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-331", "url": "https://cwe.mitre.org/data/definitions/331.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-331"] },
    "body": "Use approved randomness sources and avoid reuse or predictability."
  },
  {
    "id": "open-redirect",
    "term": "Open Redirect",
    "summary": "Open redirect occurs when an application redirects to a user‑provided URL without validation.",
    "tags": ["appsec","cwe"],
    "sources": [
      { "kind": "CWE", "citation": "CWE-601", "url": "https://cwe.mitre.org/data/definitions/601.html", "normative": true }
    ],
    "mappings": { "cweIds": ["CWE-601"] },
    "body": "Validate and constrain redirect targets to allowlists; avoid reflecting arbitrary URLs."
  },
  {
    "id": "x509-certificate",
    "term": "X.509 Certificate",
    "summary": "An X.509 certificate binds a subject to a public key using a CA signature under the Internet PKI profile.",
    "tags": ["pki","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 5280", "url": "https://www.rfc-editor.org/rfc/rfc5280", "normative": true }
    ],
    "body": "Certificates include validity, subject, issuer, and extensions; relying parties validate chain and status."
  },
  {
    "id": "udp",
    "term": "User Datagram Protocol (UDP)",
    "summary": "UDP is a connectionless, unreliable transport protocol that provides minimal services for message‑oriented communication.",
    "tags": ["network","rfc"],
    "sources": [
      { "kind": "RFC", "citation": "RFC 768", "url": "https://www.rfc-editor.org/rfc/rfc768", "normative": true }
    ],
    "body": "UDP favors low latency over reliability; higher‑layer protocols like QUIC add control and security."
  },
  {
    "id": "dos",
    "term": "Denial-of-Service (DoS)",
    "summary": "DoS aims to degrade, disrupt, or deny legitimate use of services or resources by overwhelming or exploiting systems.",
    "tags": ["security","nist"],
    "sources": [
      { "kind": "NIST", "citation": "NIST CSRC Glossary — Denial of Service", "url": "https://csrc.nist.gov/glossary/term/denial_of_service", "normative": true }
    ],
    "mappings": { "attack": { "techniqueIds": ["T1499"] } },
    "body": "Defenses include rate limiting, resource isolation, and upstream filtering; app‑layer DoS needs specific safeguards."
  },
  {
    "id": "replay-attack",
    "term": "Replay Attack",
    "summary": "A replay attack retransmits a valid transmission to obtain unauthorized effects or access.",
    "tags": ["appsec","nist"],
    "sources": [
      { "kind": "NIST", "citation": "NIST CSRC Glossary — Replay Attack", "url": "https://csrc.nist.gov/glossary/term/replay_attack", "normative": true }
    ],
    "body": "Mitigate with nonces, timestamps, sequence numbers, and channel binding."
  }
]
`);

entries.sort((a, b) => a.term.localeCompare(b.term));
for (const e of entries) {
  const outPath = path.join('src/content/terms', `${e.id}.mdx`);
  ensureFile(outPath, mdx(e));
}
console.log(`Wrote ${entries.length} terms.`);
