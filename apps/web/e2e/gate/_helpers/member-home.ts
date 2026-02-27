import { expect, type Page, type TestInfo } from '@playwright/test';

import { routes } from '../../routes';
import { gotoApp } from '../../utils/navigation';

const MEMBER_HOME_SURFACE_TEST_IDS = [
  'member-dashboard-ready',
  'home-cta-incident',
  'diaspora-ribbon',
] as const;

async function hasMemberHomeSurface(page: Page, timeoutMs = 5000): Promise<boolean> {
  for (const testId of MEMBER_HOME_SURFACE_TEST_IDS) {
    const isVisible = await page
      .getByTestId(testId)
      .first()
      .isVisible({ timeout: timeoutMs })
      .catch(() => false);
    if (isVisible) return true;
  }
  return false;
}

export async function gotoMemberHomeStable(
  page: Page,
  testInfo: TestInfo,
  markerTimeoutMs = 30000
): Promise<void> {
  await gotoApp(page, routes.member(testInfo), testInfo, {
    marker: 'dashboard-page-ready',
    markerTimeoutMs,
  });

  if (await hasMemberHomeSurface(page)) return;

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('dashboard-page-ready').first()).toBeVisible({
    timeout: markerTimeoutMs,
  });

  if (await hasMemberHomeSurface(page)) return;

  throw new Error(
    'Member home shell loaded but no member surface markers were visible after a retry.'
  );
}
