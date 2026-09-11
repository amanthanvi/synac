import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Resolves to apps/worker/package.json both from src/ (tsx) and from dist/:
// src/version.ts -> ../package.json, dist/version.js -> ../package.json.
// `require` returns `any`, so the assertion narrows it; the shape is still
// checked below rather than trusted.
const pkg = require('../package.json') as { version?: unknown };

/** The @synac/worker package version, read once at startup. */
export const WORKER_VERSION: string =
  typeof pkg.version === 'string' && pkg.version.trim()
    ? pkg.version.trim()
    : '0.0.0';

const WORKER_PROJECT_URL = 'https://github.com/amanthanvi/synac';

/** Outbound User-Agent for every ingest fetch. */
export const USER_AGENT = `synac-worker/${WORKER_VERSION} (+${WORKER_PROJECT_URL})`;

/**
 * Stamped on `field_provenance.extractor_version` and
 * `sense_definitions.extractor_version` so a re-extraction can be traced to the
 * exact worker build and adapter revision that produced it.
 *
 * `adapterVersion` is the adapter's own `ADAPTER_VERSION` constant (for example
 * `'nist@2'`), bumped by hand whenever its parsing changes shape.
 */
export function buildExtractorVersion(adapterVersion: string): string {
  const suffix = adapterVersion.trim() || 'unknown@0';
  return `synac-worker/${WORKER_VERSION}+${suffix}`;
}
