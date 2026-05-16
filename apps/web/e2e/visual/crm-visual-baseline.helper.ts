import { expect, type Locator, type Page } from '@playwright/test';

import type { CrmVisualBaselineMarker } from './crm-visual-baseline.constants';

export const CRM_VISUAL_BASELINE_VIEWPORT = { width: 1280, height: 900 } as const;

const CRM_VISUAL_BASELINE_MASK_SELECTORS = [
  '[data-testid="user-nav-email"]',
  '[data-testid="sidebar-user-menu-button"]',
  '[data-testid="user-nav"]',
  '[data-testid="cookie-consent-banner"]',
  '[data-testid="agent-crm-due-follow-up-row"]',
  '[data-testid="admin-crm-forecast-alert-metrics"]',
  '[data-testid="admin-crm-forecast-observability-summary"]',
  '[data-testid="admin-crm-forecast-observability-coverage"]',
  '[data-testid="admin-crm-forecast-observability-batches"]',
  '[data-testid="admin-crm-forecast-backfill-operator-form"]',
] as const;

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}

async function waitForNextPaint(page: Page): Promise<void> {
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  const banner = page.getByTestId('cookie-consent-banner');
  if (!(await banner.isVisible().catch(() => false))) return;

  await page.getByTestId('cookie-consent-accept').first().click();
  await expect(banner).toHaveCount(0);
}

export async function expectCrmVisualBaseline(
  page: Page,
  marker: CrmVisualBaselineMarker,
  screenshotName: string,
  options?: { mask?: Locator[] }
): Promise<void> {
  await page.setViewportSize(CRM_VISUAL_BASELINE_VIEWPORT);
  await dismissCookieConsentIfVisible(page);

  const ready = page.getByTestId(marker).first();
  await expect(ready).toBeVisible({ timeout: 30_000 });
  await waitForFonts(page);
  await waitForNextPaint(page);

  await expect(ready).toHaveScreenshot(screenshotName, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.02,
    maskColor: '#e5e7eb',
    mask: [
      ...CRM_VISUAL_BASELINE_MASK_SELECTORS.map(selector => page.locator(selector)),
      ...(options?.mask ?? []),
    ],
  });
}
