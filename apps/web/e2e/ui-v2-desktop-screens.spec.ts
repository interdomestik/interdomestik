import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const OUTPUT_DIR = path.resolve(__dirname, '../../../tmp/pilot-evidence/day17-desktop/screens');

test.use({
  viewport: { width: 1440, height: 900 },
});

async function waitForStyledUI(
  page: import('@playwright/test').Page,
  markerSelector: string,
  styleMode: 'rounded' | 'hero-gradient'
) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    // Some pages keep background requests active; continue with explicit CSS checks.
  }
  await page.waitForSelector(markerSelector, { state: 'visible', timeout: 15000 });
  await page.waitForFunction(
    () => {
      const sheets = Array.from(document.styleSheets || []);
      return sheets.length > 0;
    },
    { timeout: 15000 }
  );
  await page.waitForFunction(
    ({ selector, mode }) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (mode === 'hero-gradient') {
        return cs.backgroundImage !== 'none';
      }
      return cs.borderRadius !== '0px';
    },
    { selector: markerSelector, mode: styleMode },
    { timeout: 15000 }
  );
  await page.waitForTimeout(400);
}

test('capture deterministic desktop screenshots for UI_V2 audit', async ({ page }) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const failed: string[] = [];
  page.on('requestfailed', request => failed.push(request.url()));

  await page.goto('/sq', { waitUntil: 'domcontentloaded' });
  await waitForStyledUI(page, '[data-testid="hero-v2-digital-id-preview"]', 'rounded');
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'day17-hero-1440x900.png'),
  });

  await page.goto('/sq/member', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/sq\/member(?:\?.*)?$/, { timeout: 15000 });
  await waitForStyledUI(page, '[data-testid="member-hero"]', 'hero-gradient');
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'day17-member-top-1440x900.png'),
  });

  await page.evaluate(() => window.scrollTo({ top: Math.round(window.innerHeight * 0.9) }));
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'day17-member-scroll-1440x900.png'),
  });

  expect(failed.filter(url => url.includes('/_next/static/'))).toEqual([]);
});
