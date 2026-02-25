import { expect, type Page } from '@playwright/test';

const DEFAULT_READY_TEST_IDS = [
  'page-ready',
  'landing-page-ready',
  'dashboard-page-ready',
  'member-dashboard-ready',
  'staff-page-ready',
  'admin-page-ready',
  'auth-ready',
  'registration-page-ready',
];

type WaitOptions = {
  timeout?: number;
  markers?: string[];
};

/**
 * Wait for a specific readiness marker instead of using fixed sleep.
 */
export async function waitForReadyMarker(
  page: Page,
  marker: string,
  options?: Omit<WaitOptions, 'markers'>
) {
  await expect(page.getByTestId(marker).first()).toBeVisible({
    timeout: options?.timeout ?? 15000,
  });
}

/**
 * Wait for any known readiness marker. Useful when replacing legacy sleeps in
 * cross-surface tests that can render different role layouts.
 */
export async function waitForAnyReadyMarker(page: Page, options?: WaitOptions) {
  const markers = options?.markers?.length ? options.markers : DEFAULT_READY_TEST_IDS;
  const selector = markers.map(marker => `[data-testid="${marker}"]`).join(', ');

  await expect(page.locator(selector).first()).toBeVisible({ timeout: options?.timeout ?? 15000 });
}
