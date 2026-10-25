import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';
import { evidenceDir } from './runtime.mjs';

export async function capture(page: Page, name: string): Promise<string> {
  mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(
    evidenceDir,
    name.endsWith('.png') ? name : `${name}.png`,
  );
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
