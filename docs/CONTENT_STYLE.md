# Content Style Guide

Purpose and goals
- Evidence-first entries with clear provenance. Prefer authoritative, canonical sources.
- Keep wording concise and neutral; avoid speculation. Deterministic builds require stable content and links.

Frontmatter schema (required) — align to [src/content/schema.ts](src/content/schema.ts:1)
- id: slug matching filename (e.g., "jwt")
- term: human‑readable title (e.g., "JSON Web Token (JWT)")
- summary: ≤ 240 characters guideline; one‑sentence overview
- tags: string[]
- sources: Array of objects:
  - kind: NIST | RFC | ATTACK | CWE | CAPEC | OTHER
  - citation: label/title (e.g., "RFC 7519")
  - url: canonical URL
  - normative: true|false (optional; defaults Informative)
  - date, excerpt: optional
- mappings: optional; omit if unknown
  - attack.techniqueIds[]: e.g., ["T1059"]
  - cweIds[]: e.g., ["CWE-79"]
  - capecIds[]: e.g., ["CAPEC-63"]
  - examDomains[]: e.g., ["CISSP Domain 4"]
- updatedAt: ISO 8601 date‑time in UTC (e.g., "2025-09-02T00:00:00.000Z")

Notes
- Use exact field names from the schema: id, term, summary, tags, sources, mappings, updatedAt.
- RFC numbers belong in sources.citation; there is no mappings.rfc field.

Sourcing rules
- Prefer NIST, RFCs, and MITRE datasets (CWE, CAPEC, ATT&CK). Use canonical URLs.
- Mark normative sources with normative: true; others are informative.
- Include at least one authoritative source when possible.

Citation formatting — [buildCitation()](src/lib/citation.ts:21)
- Rendered format: "Label — URL (Normative|Informative)"
- Example: "RFC 7519 — https://www.rfc-editor.org/rfc/rfc7519 (Normative)"

JSON‑LD export — [src/pages/terms/[id].jsonld.ts](src/pages/terms/%5Bid%5D.jsonld.ts:12)
- name is taken from term; termCode from id; description from summary; url points to /terms/{id}.
- dateModified comes from updatedAt. Ensure these fields are accurate.

Content dos and don'ts
- Do keep the body concise and source‑anchored.
- Do not paste large quotations; use sources[].excerpt sparingly.
- Do not include inline HTML/JS; strict CSP prohibits inline scripts/styles.

Examples (minimal)

JWT — see [src/content/terms/jwt.mdx](src/content/terms/jwt.mdx:1)
```mdx
---
id: 'jwt'
term: 'JSON Web Token (JWT)'
summary: 'JWT is a compact, URL‑safe token for conveying claims between parties, often signed and optionally encrypted.'
tags: ['auth', 'tokens', 'rfc']
sources:
  - kind: 'RFC'
    citation: 'RFC 7519'
    url: 'https://www.rfc-editor.org/rfc/rfc7519'
    normative: true
updatedAt: '2025-09-02T00:00:00.000Z'
---
```

TLS — see [src/content/terms/tls.mdx](src/content/terms/tls.mdx:1)
```mdx
---
id: 'tls'
term: 'Transport Layer Security'
summary: 'Cryptographic protocol providing confidentiality and integrity for application‑layer traffic; modern deployments use TLS 1.2+ with strong cipher suites.'
tags: ['crypto', 'network', 'rfc', 'nist']
sources:
  - kind: 'RFC'
    citation: 'RFC 8446 (TLS 1.3)'
    url: 'https://www.rfc-editor.org/rfc/rfc8446'
    normative: true
  - kind: 'NIST'
    citation: 'NIST SP 800-52 Rev. 2'
    url: 'https://csrc.nist.gov/publications/detail/sp/800-52/rev-2/final'
    normative: true
updatedAt: '2025-08-22T00:00:00.000Z'
---
```

XSS — see [src/content/terms/xss.mdx](src/content/terms/xss.mdx:1)
```mdx
---
id: 'xss'
term: 'Cross-Site Scripting'
summary: 'Injection where untrusted input executes as active content in a victim’s browser.'
tags: ['appsec', 'web', 'cwe', 'capec']
sources:
  - kind: 'CWE'
    citation: 'CWE-79: Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)'
    url: 'https://cwe.mitre.org/data/definitions/79.html'
    normative: true
  - kind: 'CAPEC'
    citation: 'CAPEC-63: Cross-Site Scripting'
    url: 'https://capec.mitre.org/data/definitions/63.html'
    normative: true
mappings:
  cweIds: ['CWE-79']
  capecIds: ['CAPEC-63']
updatedAt: '2025-08-22T00:00:00.000Z'
---
```

Quality checklist (quick)
- Summary ≤ 240 chars
- At least one authoritative source; correct normative flags
- Canonical URLs; citations render as "Label — URL (Normative|Informative)"
- Mappings present when known; omit when unknown
- updatedAt is valid ISO 8601 UTC
- JSON‑LD fields resolve (name/url/description/dateModified)
- No inline scripts/styles; keep content deterministic

<!-- noop: retrigger CI for PR #41; no functional change -->