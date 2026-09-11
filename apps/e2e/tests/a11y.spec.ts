import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { ROUTES } from './helpers';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/** Findings below these levels are reported but do not fail the run. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'home', path: ROUTES.home },
  { name: 'search results', path: ROUTES.search },
  { name: 'acronym index', path: ROUTES.acronyms },
  { name: 'acronym entry', path: ROUTES.acronym },
  { name: 'term entry', path: ROUTES.term },
  { name: 'source index', path: ROUTES.sources },
  { name: 'tag page', path: ROUTES.tag },
];

for (const { name, path } of PAGES) {
  test(`${name} has no serious or critical accessibility violations`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    const blocking = results.violations.filter((violation) =>
      BLOCKING_IMPACTS.has(violation.impact ?? ''),
    );

    const report = blocking
      .map((violation) => {
        const targets = violation.nodes
          .map((node) => node.target.join(' '))
          .join(', ');
        return `${violation.id} (${violation.impact ?? 'unknown'}) on ${targets}\n  ${violation.helpUrl}`;
      })
      .join('\n');

    expect(blocking, `${path}\n${report}`).toHaveLength(0);
  });
}
