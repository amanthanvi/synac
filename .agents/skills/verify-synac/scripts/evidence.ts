import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

const rawEvidenceDir = process.env.VERIFY_EVIDENCE_DIR;
if (!rawEvidenceDir) {
  throw new Error(
    'VERIFY_EVIDENCE_DIR is unset. The Playwright config sets it from runtime.mjs.',
  );
}
const evidenceDir: string = rawEvidenceDir;

export async function capture(page: Page, name: string): Promise<string> {
  mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(
    evidenceDir,
    name.endsWith('.png') ? name : `${name}.png`,
  );
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
