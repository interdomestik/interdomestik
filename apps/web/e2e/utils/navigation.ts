import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Re-export getLocale for convenience
 */
export { getLocale } from '../routes';

type PathLike = string | URL | { pathname: string; search?: string; hash?: string };

function normalizePath(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return `${input.pathname}${input.search}${input.hash}`;

  if (input && typeof input === 'object' && 'pathname' in input) {
    const o = input as any;
    if (typeof o.pathname === 'string') {
      const search = typeof o.search === 'string' ? o.search : '';
      const hash = typeof o.hash === 'string' ? o.hash : '';
      return `${o.pathname}${search}${hash}`;
    }
  }

  // strict + actionable error
  throw new TypeError(
    `[gotoApp] Invalid path input: expected string|URL|{pathname,...} but got ${Object.prototype.toString.call(
      input
    )}`
  );
}

/**
 * Check if path already starts with a supported locale
 */
function pathHasLocalePrefix(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return /^\/(sq|mk|en|sr|de|hr)(\/|$)/.test(normalized);
}

/**
 * Navigates to a path using project-derived baseURL and waits for a marker.
 * Strictly enforces Rule #2: No ad-hoc URL building.
 *
 * If path already includes a locale prefix (e.g., /sq/pricing from routes helpers),
 * we use the origin only to avoid double-locale URLs.
 */
export async function gotoApp(
  page: Page,
  path: PathLike,
  testInfo: TestInfo,
  options?: { marker?: string }
) {
  const raw = path; // wherever you currently take it from
  const pathStr = normalizePath(raw);

  const baseUrl = testInfo.project.use.baseURL || '';
  const origin = new URL(baseUrl).origin;

  let targetUrl: string;

  if (pathHasLocalePrefix(pathStr)) {
    // Path already has locale (e.g., /sq/pricing from routes.pricing(testInfo))
    // Use origin only to avoid double-locale like /sq/sq/pricing
    const normalizedPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
    targetUrl = `${origin}${normalizedPath}`;
  } else {
    // Path is locale-agnostic (e.g., /member from ensureAuthenticated)
    // Append to locale-prefixed baseURL
    const normalizedPath = pathStr.startsWith('/') ? pathStr.slice(1) : pathStr;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    targetUrl = new URL(normalizedPath, normalizedBase).toString();
  }

  console.log(`[E2E Nav] ${targetUrl}`);
  await page.goto(targetUrl);

  const marker = options?.marker ?? 'page-ready';

  if (marker === 'body') {
    await page.waitForLoadState('domcontentloaded');
  } else {
    await expect(page.getByTestId(marker)).toBeVisible({ timeout: 15000 });
  }
}
