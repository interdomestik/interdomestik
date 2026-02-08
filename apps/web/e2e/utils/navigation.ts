import {
  expect,
  type Page,
  type Response as PlaywrightResponse,
  type TestInfo,
} from '@playwright/test';

/**
 * Re-export getLocale for convenience
 */
export { getLocale } from '../routes';

type PathLike = string | URL | { pathname: string; search?: string; hash?: string };

function normalizePath(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return `${input.pathname}${input.search}${input.hash}`;

  if (input && typeof input === 'object' && 'pathname' in input) {
    const o = input as Record<string, unknown>;
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
): Promise<PlaywrightResponse | null> {
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

  let response: PlaywrightResponse | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      break;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const isRetryable =
        message.includes('net::ERR_ABORTED') ||
        message.includes('net::ERR_CONNECTION_RESET') ||
        message.includes('net::ERR_CONNECTION_REFUSED');

      if (attempt < maxRetries && isRetryable) {
        console.warn(`[gotoApp] Retry ${attempt + 1}/${maxRetries} for ${targetUrl}: ${message}`);
        await page.waitForTimeout(1000);
        continue;
      }
      throw e;
    }
  }

  if (response?.status() === 404 || response?.headers()['x-nextjs-postponed']) {
    // Check if we rendered our custom Not Found UI
    const notFoundVisible = await page
      .getByTestId('not-found-page')
      .isVisible()
      .catch(() => false);
    if (notFoundVisible) {
      if (options?.marker && options.marker !== 'not-found-page') {
        throw new Error(
          `Navigation failed: Landed on 404 Not Found page while waiting for "${options.marker}"`
        );
      }
    }
  }

  const marker = options?.marker ?? 'page-ready';

  if (['domcontentloaded', 'load', 'networkidle'].includes(marker)) {
    await page.waitForLoadState(marker as 'domcontentloaded' | 'load' | 'networkidle');
  } else if (marker === 'body') {
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeAttached({ timeout: 15000 });

    // Best-effort wait for body visibility without hard fail
    await page
      .waitForFunction(
        () => {
          const b = document.body;
          if (!b) return false;
          const s = getComputedStyle(b);
          return s.visibility !== 'hidden' && s.display !== 'none';
        },
        { timeout: 3000 }
      )
      .catch(() => {
        // Body attached but still reported hidden - ignoring as non-fatal
      });
  } else {
    try {
      // Some pages can render duplicated readiness wrappers in transitional layouts.
      // Accept first visible marker instance instead of failing strict locator resolution.
      await expect(page.getByTestId(marker).first()).toBeVisible({ timeout: 15000 });
    } catch (e) {
      throw e;
    }
  }

  return response;
}
