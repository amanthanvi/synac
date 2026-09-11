import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  SEEDED,
  firstAcronymPath,
  firstTagPath,
  gotoStable,
} from './helpers.js';

/** Fails the test on any serious/critical WCAG 2.2 AA violation. */
async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  );

  const summary = blocking
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}, ${violation.nodes.length} nodes): ${violation.help}\n    ${violation.nodes[0]?.target.join(' ')}`,
    )
    .join('\n  ');

  expect(
    blocking,
    `${label} has serious/critical a11y violations:\n  ${summary}`,
  ).toEqual([]);
}

test.describe('accessibility (WCAG 2.2 AA)', () => {
  test('home', async ({ page }) => {
    await gotoStable(page, '/');
    await expectNoSeriousViolations(page, '/');
  });

  test('search results', async ({ page }) => {
    await gotoStable(page, `/search?q=${SEEDED.looseQuery}`);
    await expectNoSeriousViolations(page, '/search?q=soc');
  });

  test('acronym index', async ({ page }) => {
    await gotoStable(page, '/acronyms');
    await expectNoSeriousViolations(page, '/acronyms');
  });

  test('first acronym entry', async ({ page, request }) => {
    const path = await firstAcronymPath(request);
    await gotoStable(page, path);
    await expectNoSeriousViolations(page, path);
  });

  test('sources directory', async ({ page }) => {
    await gotoStable(page, '/sources');
    await expectNoSeriousViolations(page, '/sources');
  });

  test('a tag page', async ({ page, request }) => {
    const path = await firstTagPath(request);
    await gotoStable(page, path);
    await expectNoSeriousViolations(page, path);
  });
});
