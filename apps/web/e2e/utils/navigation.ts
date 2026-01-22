import { Page, expect, TestInfo } from '@playwright/test';
import { routes } from '../routes';

type GlobalE2E = typeof globalThis & {
  __E2E_BASE_URL?: string;
};

/**
 * Robust navigation helper that:
 * 1. Ensures routes.ts has the correct project context (baseURL).
 * 2. Navigates to the route (prepending locale if string path provided).
 * 3. Waits for a deterministic readiness marker (default: 'page-ready').
 */
export async function gotoApp(
  page: Page,
  routeOrBuilder: string | ((locale?: string) => string),
  testInfo: TestInfo,
  options?: {
    locale?: string;
    marker?: string;
  }
) {
  // Ensure global is set for routes.ts to work correctly
  if (testInfo.project.use.baseURL) {
    (globalThis as GlobalE2E).__E2E_BASE_URL = testInfo.project.use.baseURL;
  }

  let url: string;
  if (typeof routeOrBuilder === 'string') {
    url = routes.path(routeOrBuilder, options?.locale);
  } else {
    url = routeOrBuilder(options?.locale);
  }

  await page.goto(url);

  const marker = options?.marker ?? 'page-ready';
  await expect(page.getByTestId(marker)).toBeVisible();
}
