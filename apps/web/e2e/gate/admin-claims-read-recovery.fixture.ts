import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import enClaims from '../../src/messages/en/admin-claims.json';
import mkClaims from '../../src/messages/mk/admin-claims.json';
import sqClaims from '../../src/messages/sq/admin-claims.json';
import srClaims from '../../src/messages/sr/admin-claims.json';
import enCommon from '../../src/messages/en/common.json';
import mkCommon from '../../src/messages/mk/common.json';
import sqCommon from '../../src/messages/sq/common.json';
import srCommon from '../../src/messages/sr/common.json';
import {
  ADMIN_CLAIMS_READ,
  installAdminClaimsReadSeam,
  type AdminClaimsReadSeam,
} from './admin-claims-read-result.fixture';
import { settleFrames } from './information-request-read-result.fixture';
import { activateRootFontScale, visible } from './staff-case-workspace-presentation';

// Injected serialized read-result faults over the real Next RSC transport. This is not a database
// failure: a genuinely thrown server read is covered by the page and loader unit tests.
export const FILTERS = {
  lifecycle: 'processing',
  status: 'active',
  assigned: 'unassigned',
  diaspora: 'diaspora',
} as const;
export const SEARCH_TERM = 's7-read-recovery';

type CatalogSource = {
  claims: {
    title: string;
    read_failed: string;
    read_result: string;
    pagination_info: string;
    table: { empty_state: string };
  };
  common: { tryAgain: string; loading: string; cookie_consent: { decline: string } };
};
const CATALOGS = {
  en: { claims: enClaims.admin.claims_page, common: enCommon.common },
  sq: { claims: sqClaims.admin.claims_page, common: sqCommon.common },
  mk: { claims: mkClaims.admin.claims_page, common: mkCommon.common },
  sr: { claims: srClaims.admin.claims_page, common: srCommon.common },
} satisfies Record<string, CatalogSource>;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// Placeholder-aware pattern of a catalog message: {name} becomes a captured integer.
function templatePattern(template: string, anchored: boolean): RegExp {
  const source = template
    .split(/\{\w+\}/)
    .map(escape)
    .join(String.raw`(\d+)`);
  return new RegExp(anchored ? `^${source}$` : source);
}

export function catalogFor(testInfo: TestInfo) {
  const locale = routes.getLocale(testInfo);
  if (locale !== 'en' && locale !== 'sq' && locale !== 'mk' && locale !== 'sr') {
    throw new Error('Gate project locale has no admin claims catalog');
  }
  const { claims, common } = CATALOGS[locale];
  return {
    title: claims.title,
    failed: claims.read_failed,
    empty: claims.table.empty_state,
    tryAgain: common.tryAgain,
    loading: common.loading,
    decline: common.cookie_consent.decline,
    resultPattern: templatePattern(claims.read_result, true),
    paginationPattern: templatePattern(claims.pagination_info, false),
  };
}
type Catalog = ReturnType<typeof catalogFor>;

function partsFor(page: Page) {
  const recovery = visible(page, ADMIN_CLAIMS_READ.recoveryTestId);
  return {
    ready: visible(page, 'admin-claims-v2-ready'),
    region: visible(page, ADMIN_CLAIMS_READ.regionTestId),
    heading: page.locator(`h1[id="${ADMIN_CLAIMS_READ.headingId}"]`).filter({ visible: true }),
    recovery,
    alert: recovery.getByRole('alert'),
    status: recovery.getByRole('status'),
    retry: recovery.getByRole('button'),
    result: visible(page, ADMIN_CLAIMS_READ.resultTestId),
    filters: visible(page, 'admin-claims-filter-region'),
    search: visible(page, 'claims-search-input'),
    tabs: visible(page, 'claims-lifecycle-tabs'),
    cards: visible(page, 'claim-operational-card'),
  };
}
type Parts = ReturnType<typeof partsFor>;

export async function until(
  seam: AdminClaimsReadSeam,
  label: string,
  ready: (counts: ReturnType<AdminClaimsReadSeam['counts']>) => boolean
): Promise<void> {
  await expect
    .poll(
      () => {
        seam.assertNoError();
        return ready(seam.counts());
      },
      { message: label }
    )
    .toBe(true);
}

// Chooses the necessary-only cookie button when a banner is actually visible and unique.
async function dismissCookieBanner(page: Page, catalog: Catalog): Promise<void> {
  const decline = page
    .getByRole('button', { name: catalog.decline, exact: true })
    .filter({ visible: true });
  const count = await decline.count();
  if (count === 0) return;
  expect(count, 'cookie banner offers one necessary-only button').toBe(1);
  await decline.click();
  await expect(decline).toHaveCount(0);
}

export async function openClaims(
  page: Page,
  testInfo: TestInfo,
  catalog: Catalog,
  query: Record<string, string> = {}
): Promise<Parts> {
  const search = new URLSearchParams(query).toString();
  const pathname = routes.adminClaims(testInfo);
  await gotoApp(page, search ? `${pathname}?${search}` : pathname, testInfo, {
    marker: 'admin-claims-v2-ready',
  });
  await settleFrames(page);
  await dismissCookieBanner(page, catalog);
  const parts = partsFor(page);
  await expect(parts.ready).toHaveCount(1);
  await expect(parts.recovery).toHaveCount(0);
  await expect(parts.result).toHaveCount(1);
  await expect(parts.result).toHaveText(catalog.resultPattern);
  return parts;
}

export function expectRetainedUrl(
  page: Page,
  pathname: string,
  retained: Record<string, string>
): void {
  const url = new URL(page.url());
  expect(url.pathname).toBe(pathname);
  expect(Object.fromEntries(url.searchParams)).toEqual({ ...retained, view: 'list' });
}

// Failed read: localized error in the single claims region, filters kept, nothing stale shown.
export async function expectFailed(
  parts: Parts,
  catalog: Catalog,
  state: { retried: boolean; draft?: string }
): Promise<void> {
  await expect(parts.recovery).toHaveCount(1);
  await expect(parts.alert).toHaveText(catalog.failed);
  await expect(parts.retry).toHaveCount(1);
  await expect(parts.retry).toHaveText(catalog.tryAgain);
  await expect(parts.retry).toHaveAttribute('aria-busy', 'false');
  await expect(parts.retry).toHaveAttribute('aria-disabled', 'false');
  await expect(parts.status).toHaveText(state.retried ? catalog.failed : '');
  await expect(parts.ready).toHaveCount(1);
  await expect(parts.heading).toHaveCount(1);
  await expect(parts.heading).toContainText(catalog.title);
  await expect(parts.region).toHaveCount(1);
  await expect(parts.region).toHaveAccessibleName(catalog.title);
  await expect(parts.filters).toHaveCount(1);
  await expect(parts.search).toHaveCount(1);
  if (state.draft !== undefined) await expect(parts.search).toHaveValue(state.draft);
  await expect(parts.result).toHaveCount(1);
  await expect(parts.result).toHaveText('');
  await expect(parts.tabs).toHaveCount(0);
  await expect(parts.cards).toHaveCount(0);
  await expect(parts.region.getByText(catalog.empty, { exact: true })).toHaveCount(0);
  await expect(parts.region.getByText(catalog.paginationPattern)).toHaveCount(0);
}

export async function expectPending(parts: Parts, catalog: Catalog): Promise<void> {
  await expect(parts.recovery).toHaveCount(1);
  await expect(parts.retry).toHaveAttribute('aria-busy', 'true');
  await expect(parts.retry).toHaveAttribute('aria-disabled', 'true');
  await expect(parts.retry).toHaveText(catalog.loading);
  await expect(parts.status).toHaveText(catalog.loading);
  await expect(parts.cards).toHaveCount(0);
  await expect(parts.result).toHaveText('');
}

// Settled success: the announced text is the delivered response's own, so the count is derived
// from the matched native fixture and may legitimately exceed the loaded rows.
export async function expectAnnounced(
  parts: Parts,
  seam: AdminClaimsReadSeam,
  catalog: Catalog
): Promise<number> {
  const delivered = seam.delivered();
  if (delivered === null) throw new Error('A successful read was not delivered');
  await expect(parts.result).toHaveText(delivered);
  const count = Number(catalog.resultPattern.exec(delivered)?.[1]);
  expect(Number.isInteger(count), 'announcement follows the catalog template').toBe(true);
  await expect(parts.recovery).toHaveCount(0);
  await expect(parts.alert).toHaveCount(0);
  await expect(parts.tabs).toHaveCount(1);
  expect(await parts.cards.count()).toBeLessThanOrEqual(count);
  if (count === 0) {
    await expect(parts.region.getByText(catalog.empty, { exact: true })).toHaveCount(1);
    await expect(parts.region.getByText(catalog.paginationPattern)).toHaveCount(0);
  } else {
    expect(await parts.cards.count()).toBeGreaterThan(0);
  }
  return count;
}

// Page-side: measures one node against the viewport and its own content box.
function measureFit(node: Element) {
  const { left, right, width } = node.getBoundingClientRect();
  const { scrollWidth, clientWidth } = node;
  const { overflowX } = getComputedStyle(node);
  const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return { left, right, width, scrollWidth, clientWidth, overflowX, rootPx, vw: window.innerWidth };
}

// Doubled root text at 320px: the actual error, retry, filter and region nodes must fit by layout,
// not by clipping.
export async function expectNarrowFit(page: Page, parts: Parts, testInfo: TestInfo): Promise<void> {
  const original = page.viewportSize();
  if (!original) throw new Error('Gate project must define a viewport');
  try {
    await page.setViewportSize({ width: 320, height: original.height });
    const rootPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const scaled = await activateRootFontScale(page, await page.evaluate(rootPx));
    const targets: [string, Locator][] = [
      ['region', parts.region],
      ['recovery', parts.recovery],
      ['error', parts.alert],
      ['retry', parts.retry],
      ['filters', parts.filters],
    ];
    const table: ({ name: string } & ReturnType<typeof measureFit>)[] = [];
    // Strictly serial: each target is counted, scrolled and measured only after the previous one
    // finished, because concurrent scrolling would race the geometry being measured.
    await targets.reduce<Promise<void>>(async (previous, [name, target]) => {
      await previous;
      await expect(target).toHaveCount(1);
      await target.scrollIntoViewIfNeeded();
      table.push({ name, ...(await target.evaluate(measureFit)) });
    }, Promise.resolve());
    await testInfo.attach('admin-claims-read-recovery-fit', {
      body: JSON.stringify({ rootFontPx: scaled, rows: table }),
      contentType: 'application/json',
    });
    for (const fit of table) {
      expect(fit.rootPx, fit.name).toBe(scaled);
      expect(fit.width, fit.name).toBeGreaterThan(0);
      expect(fit.left, fit.name).toBeGreaterThanOrEqual(0);
      expect(fit.right, fit.name).toBeLessThanOrEqual(fit.vw + 1);
      expect(fit.scrollWidth, fit.name).toBeLessThanOrEqual(fit.clientWidth + 1);
      expect(['hidden', 'clip'], fit.name).not.toContain(fit.overflowX);
    }
    await expect(parts.retry).toHaveAttribute('aria-busy', 'false');
  } finally {
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await page.setViewportSize(original);
  }
}

export async function withSeam(
  page: Page,
  testInfo: TestInfo,
  catalog: Catalog,
  run: (seam: AdminClaimsReadSeam, pathname: string) => Promise<void>
): Promise<void> {
  test.setTimeout(120_000);
  const pathname = routes.adminClaims(testInfo);
  const seam = await installAdminClaimsReadSeam(page, { pathname, failureMessage: catalog.failed });
  try {
    await run(seam, pathname);
    seam.assertNoError();
    expect(seam.counts()).toMatchObject({ errors: 0, awaitingRelease: false });
    await testInfo.attach('admin-claims-read-recovery-counts', {
      body: JSON.stringify(seam.counts()),
      contentType: 'application/json',
    });
  } finally {
    await seam.restore();
  }
}
