import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

/**
 * Automated accessibility check: axe on every page, light and dark, at the
 * desktop and mobile widths (the two Playwright projects). Fails on any
 * WCAG 2.2 A/AA violation.
 *
 * axe can't measure text over the ::before slash pattern (it reports those
 * as "incomplete", not violations); scripts/contrast.mjs covers that case.
 */
const PAGES = [
  '/',
  '/about/',
  '/contact/',
  '/cv/',
  '/cv/support/',
  '/thanks/',
  '/work/igrow/',
  '/work/woocommerce-marketplace/',
  '/work/quiver-cafe/',
  '/this-page-does-not-exist/',
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    // Reduced motion: scroll-reveal sections are fully visible straight away,
    // so axe sees final colours rather than a mid-fade.
    test.use({ colorScheme, reducedMotion: 'reduce' });

    for (const path of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.goto(path);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const summary = violations.map(
          (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        );
        expect(summary, summary.join('\n')).toEqual([]);
      });
    }
  });
}
