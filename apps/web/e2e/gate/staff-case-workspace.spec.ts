import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';
import { gotoApp } from '../utils/navigation';

const WORKSPACE_REGIONS = [
  'staff-claim-handling',
  'staff-claim-requests',
  'staff-claim-messages',
  'staff-claim-context',
  'staff-status-history',
] as const;

const MANAGER_REGIONS = ['staff-claim-requests', 'staff-claim-context', 'staff-status-history'];

// The shipped banner owns exactly one necessary-only control, so the real decline control is
// used inside the real banner. Nothing here bypasses auth or privacy: it makes the minimal
// necessary-only choice, asserts the control is unique and verifies the banner is dismissed.
const CONSENT_BANNER_SELECTOR = '[data-testid="cookie-consent-banner"]';
const CONSENT_DECLINE_SELECTOR = '[data-testid="cookie-consent-decline"]';

type PresentationMetrics = {
  rootFontSizePx: number;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  documentOverflowPx: number;
  bodyOverflowPx: number;
  workspaceOverflowPx: number;
  workspaceWidthPx: number;
};

function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

function navLink(page: Page, section: string) {
  return page
    .locator(`[data-testid="staff-claim-workspace-nav-link"][data-section="${section}"]`)
    .filter({ visible: true });
}

async function chooseNecessaryCookies(page: Page): Promise<string> {
  const banner = page.locator(CONSENT_BANNER_SELECTOR).filter({ visible: true });
  if ((await banner.count()) === 0) return 'no-consent-banner-present';

  await expect(banner).toHaveCount(1);
  const decline = banner.locator(CONSENT_DECLINE_SELECTOR).filter({ visible: true });
  await expect(decline).toHaveCount(1);
  await decline.click();
  await expect(page.locator(CONSENT_BANNER_SELECTOR)).toHaveCount(0);
  return `necessary-only:${CONSENT_DECLINE_SELECTOR}`;
}

async function workspaceRoot(page: Page) {
  const workspace = visible(page, 'staff-claim-detail-ready');
  await expect(workspace).toHaveCount(1);
  return workspace;
}

type WorkspaceTextSizes = { heading: number | null; paragraph: number | null };

// Next can leave a stale hidden ready marker, so region order is read inside the single visible
// workspace node instead of through document-wide id lookups.
async function regionOrder(page: Page, regions: readonly string[]): Promise<string[]> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate(
    (root, ids) => {
      const found = ids.flatMap(id => {
        const node = root.querySelector(`[id="${id}"]`);
        return node ? [{ id, node }] : [];
      });
      found.sort((a, b) =>
        a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
      return found.map(entry => entry.id);
    },
    [...regions]
  );
}

/** Measures document, body and visible-workspace overflow so reflow failures cannot be masked. */
async function presentationMetrics(page: Page): Promise<PresentationMetrics> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate(node => {
    const overflow = (element: Element | null) =>
      element ? Math.round(element.scrollWidth - element.clientWidth) : -1;
    return {
      rootFontSizePx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      documentOverflowPx: overflow(document.documentElement),
      bodyOverflowPx: overflow(document.body),
      workspaceOverflowPx: overflow(node),
      workspaceWidthPx: Math.round(node.getBoundingClientRect().width),
    };
  });
}

/** Reads representative heading and paragraph text sizes inside the visible workspace. */
async function workspaceTextSizes(page: Page): Promise<WorkspaceTextSizes> {
  const workspace = await workspaceRoot(page);
  return workspace.evaluate(node => {
    const read = (selector: string) => {
      const element = node.querySelector(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
    };
    return { heading: read('h1, h2, h3'), paragraph: read('p') };
  });
}

// Activates a local CSS root font scale from the measured baseline and waits for the real
// computed value: no browser zoom and no style or security policy is involved.
async function activateRootFontScale(page: Page, baselineRootFontPx: number): Promise<number> {
  expect(baselineRootFontPx).toBeGreaterThan(0);
  const targetRootFontPx = baselineRootFontPx * 2;
  await page.evaluate(px => {
    document.documentElement.style.setProperty('font-size', `${px}px`, 'important');
  }, targetRootFontPx);
  const readRootFontPx = () =>
    page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  await expect.poll(readRootFontPx).toBe(targetRootFontPx);
  return targetRootFontPx;
}

async function recordPresentation(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<PresentationMetrics> {
  const metrics = await presentationMetrics(page);
  await testInfo.attach(`staff-case-workspace-${label}-metrics`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach(`staff-case-workspace-${label}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  return metrics;
}

function expectNoHorizontalOverflow(metrics: PresentationMetrics) {
  expect(metrics.workspaceWidthPx).toBeGreaterThan(0);
  expect(metrics.workspaceOverflowPx).toBeLessThanOrEqual(1);
  expect(metrics.bodyOverflowPx).toBeLessThanOrEqual(1);
  expect(metrics.documentOverflowPx).toBeLessThanOrEqual(1);
}

test.describe('Staff case workspace', () => {
  test('assigned staff get handling work before secondary context on desktop and at 320 CSS width', async ({
    staffPage: page,
  }, testInfo) => {
    const { claimId } = await resolveSeededClaimContext(testInfo);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });

    await gotoApp(page, routes.staffClaimDetail(claimId, testInfo), testInfo, {
      marker: 'staff-claim-detail-ready',
    });
    const consent = await chooseNecessaryCookies(page);
    testInfo.annotations.push({ type: 'cookie-choice', description: consent });

    const nonGetRequests: string[] = [];
    page.on('request', request => {
      if (request.method() !== 'GET') nonGetRequests.push(`${request.method()} ${request.url()}`);
    });

    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ).toBe(true);

    // Exactly one visible workspace, header and control: uniqueness is asserted, not masked.
    await expect(visible(page, 'staff-claim-detail-ready')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-workspace-header')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-workspace-reference')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-workspace-nav')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-workspace-back')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-detail-actions')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-requests')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-detail-messaging')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-context')).toHaveCount(1);
    for (const section of WORKSPACE_REGIONS) {
      await expect(navLink(page, section)).toHaveCount(1);
    }
    expect(await regionOrder(page, WORKSPACE_REGIONS)).toEqual([...WORKSPACE_REGIONS]);

    const desktop = await recordPresentation(page, testInfo, 'desktop');
    expectNoHorizontalOverflow(desktop);

    await page.setViewportSize({ width: 320, height: 720 });
    await expect(visible(page, 'staff-claim-detail-ready')).toHaveCount(1);
    expect(await regionOrder(page, WORKSPACE_REGIONS)).toEqual([...WORKSPACE_REGIONS]);
    const mobile = await recordPresentation(page, testInfo, '320');
    expect(mobile.viewport.width).toBeLessThanOrEqual(320);
    expectNoHorizontalOverflow(mobile);

    // CSS text scaling only, activated from the measured baseline and awaited as a computed
    // condition: native browser zoom is not exercised and nothing is persisted.
    const baselineTextSizes = await workspaceTextSizes(page);
    const targetRootFontPx = await activateRootFontScale(page, mobile.rootFontSizePx);
    const enlargedTextSizes = await workspaceTextSizes(page);
    const textScale = {
      baselineRootFontPx: mobile.rootFontSizePx,
      targetRootFontPx,
      baselineTextSizes,
      enlargedTextSizes,
    };
    await testInfo.attach('staff-case-workspace-320-text-scale', {
      body: JSON.stringify(textScale, null, 2),
      contentType: 'application/json',
    });
    const enlarged = await recordPresentation(page, testInfo, '320-enlarged');
    expect(enlarged.rootFontSizePx).toBe(targetRootFontPx);
    expect(enlarged.viewport.width).toBe(mobile.viewport.width);
    for (const [key, before] of Object.entries(baselineTextSizes)) {
      const after = enlargedTextSizes[key as keyof WorkspaceTextSizes];
      if (before === null || after === null) {
        testInfo.annotations.push({ type: 'text-scale-sample', description: `${key} missing` });
        continue;
      }
      expect(after).toBeGreaterThan(before);
    }
    await expect(visible(page, 'staff-claim-workspace-nav')).toHaveCount(1);
    expectNoHorizontalOverflow(enlarged);

    await expect(navLink(page, 'staff-claim-context')).toHaveCount(1);
    await navLink(page, 'staff-claim-context').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#staff-claim-context$/);
    await expect(visible(page, 'staff-claim-context')).toHaveCount(1);

    await testInfo.attach('staff-case-workspace-non-get-requests', {
      body: JSON.stringify(nonGetRequests, null, 2),
      contentType: 'application/json',
    });
    expect(
      nonGetRequests.filter(entry => /\/api\/(claims|messages|information-requests)/.test(entry))
    ).toEqual([]);
  });

  test('branch managers keep read-only context without handling or message destinations', async ({
    branchManagerPage: page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });

    await gotoApp(page, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });
    testInfo.annotations.push({
      type: 'cookie-choice',
      description: await chooseNecessaryCookies(page),
    });

    // Discovery only: the queue lists every record this manager may already read, and any one of
    // them proves the read-only workspace. The choice is scoped to visible permitted rows and is
    // recorded; it is never used to tolerate duplicate detail controls below.
    const queueEntries = page.getByTestId('staff-claims-view').filter({ visible: true });
    const queueCount = await queueEntries.count();
    expect(queueCount).toBeGreaterThan(0);
    testInfo.annotations.push({
      type: 'queue-entry-choice',
      description: `first of ${queueCount} visible permitted queue records`,
    });
    await queueEntries.first().click();

    await expect(visible(page, 'staff-claim-detail-ready')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-readonly-notice')).toHaveCount(1);
    await expect(navLink(page, 'staff-claim-handling')).toHaveCount(0);
    await expect(navLink(page, 'staff-claim-messages')).toHaveCount(0);
    await expect(page.getByTestId('staff-claim-detail-actions')).toHaveCount(0);
    await expect(page.getByTestId('staff-claim-detail-messaging')).toHaveCount(0);
    await expect(page.getByTestId('staff-information-request-form')).toHaveCount(0);

    for (const section of MANAGER_REGIONS) {
      await expect(navLink(page, section)).toHaveCount(1);
    }
    await expect(visible(page, 'staff-claim-detail-member')).toHaveCount(1);
    await expect(visible(page, 'staff-claim-detail-agent')).toHaveCount(1);
    expect(await regionOrder(page, WORKSPACE_REGIONS)).toEqual(MANAGER_REGIONS);

    await navLink(page, 'staff-claim-context').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#staff-claim-context$/);

    const desktop = await recordPresentation(page, testInfo, 'branch-manager-desktop');
    expectNoHorizontalOverflow(desktop);

    await page.setViewportSize({ width: 320, height: 720 });
    await expect(visible(page, 'staff-claim-detail-ready')).toHaveCount(1);
    expect(await regionOrder(page, WORKSPACE_REGIONS)).toEqual(MANAGER_REGIONS);
    const mobile = await recordPresentation(page, testInfo, 'branch-manager-320');
    expect(mobile.viewport.width).toBeLessThanOrEqual(320);
    expectNoHorizontalOverflow(mobile);
  });
});
