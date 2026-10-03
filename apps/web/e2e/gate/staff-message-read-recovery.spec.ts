import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';
import { activateRootFontScale } from './staff-case-workspace-presentation';
import {
  collectPanelDiagnostics,
  COUNT,
  DRAFT,
  EMPTY,
  expectFitsWithoutOverflow,
  expectNotClippedInsidePanel,
  PANEL,
  READ_ERROR,
  REFRESH,
  RETRY,
  rootFontSize,
} from './staff-message-read-layout';
import { failOneClaimRead, withReadSeam } from './staff-message-read-test-seam';

// The shipped banner owns exactly one necessary-only control, so the real decline control is used
// inside the real banner. Nothing here bypasses auth or privacy.
const CONSENT_BANNER_SELECTOR = '[data-testid="cookie-consent-banner"]';
const CONSENT_DECLINE_SELECTOR = '[data-testid="cookie-consent-decline"]';

const DRAFT_TEXT = 'Operator draft that must survive a failed read';
// A recoverable service failure must never leak transport or key detail into operator copy.
const FORBIDDEN_FRAGMENTS = [
  'transport-failure-fixture',
  '500',
  'internal server error',
  'read.loaderror',
  'messaging.read',
];

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

async function openStaffMessaging(page: Page, testInfo: TestInfo) {
  const { claimId } = await resolveSeededClaimContext(testInfo);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await gotoApp(page, routes.staffClaimDetail(claimId, testInfo), testInfo, {
    marker: 'staff-claim-detail-ready',
  });
  const consent = await chooseNecessaryCookies(page);
  testInfo.annotations.push({ type: 'cookie-choice', description: consent });

  expect(
    await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  ).toBe(true);

  // Exactly one visible conversation, one refresh control and one draft field: uniqueness is
  // asserted rather than masked by a first-match selector.
  const panel = page.locator(PANEL).filter({ visible: true });
  await expect(panel).toHaveCount(1);
  await expect(panel.locator(REFRESH)).toHaveCount(1);
  await expect(panel.locator(DRAFT)).toHaveCount(1);
  await expect(panel.locator(READ_ERROR)).toHaveCount(0);

  return { claimId, panel };
}

function expectGenericFailureCopy(text: string) {
  const normalized = text.trim();
  expect(normalized.length).toBeGreaterThan(0);
  for (const fragment of FORBIDDEN_FRAGMENTS) {
    expect(normalized.toLowerCase()).not.toContain(fragment);
  }
}

test.describe('Staff claim message read recovery', () => {
  test('a failed message read stays recoverable without claiming an empty conversation', async ({
    staffPage: page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { claimId, panel } = await openStaffMessaging(page, testInfo);

    const draftSends: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && (request.postData() ?? '').includes(DRAFT_TEXT)) {
        draftSends.push(request.url());
      }
    });

    await panel.locator(DRAFT).fill(DRAFT_TEXT);
    const countBefore = await panel.locator(COUNT).allInnerTexts();
    const emptyBefore = await panel.locator(EMPTY).count();

    const failure = await failOneClaimRead(page, claimId, { hold: true });
    await panel.locator(REFRESH).click();

    // Busy is reported for the real in-flight action while it is held open.
    await withReadSeam(failure, () => expect(panel).toHaveAttribute('aria-busy', 'true'));
    failure.release();

    const error = panel.locator(READ_ERROR);
    const retry = panel.locator(RETRY);
    await withReadSeam(failure, () => expect(error).toHaveCount(1));
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    expect(failure.count()).toBe(1);

    expectGenericFailureCopy(await error.innerText());
    await expect(retry).toHaveCount(1);
    expectGenericFailureCopy(await retry.innerText());
    await expect(retry).toHaveAttribute('aria-busy', 'false');

    // The failure neither drops the loaded history nor invents an empty conversation, and the
    // unsent draft stays mounted and editable.
    expect(await panel.locator(COUNT).allInnerTexts()).toEqual(countBefore);
    expect(await panel.locator(EMPTY).count()).toBe(emptyBefore);
    await expect(panel.locator(DRAFT)).toHaveValue(DRAFT_TEXT);
    await expect(panel.locator(DRAFT)).toBeEditable();

    await failure.restore();
    await retry.focus();
    expect(await retry.evaluate(element => element === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');

    await expect(error).toHaveCount(0);
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await expect(panel.locator(DRAFT)).toHaveValue(DRAFT_TEXT);
    expect(draftSends).toEqual([]);

    testInfo.annotations.push({
      type: 'read-recovery',
      description: `failed-reads:${failure.count()} draft-sends:${draftSends.length}`,
    });
  });

  test('the read failure and its recovery fit at 320 CSS px with doubled root text', async ({
    staffPage: page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 720 });
    const { claimId, panel } = await openStaffMessaging(page, testInfo);

    // The baseline is the measured computed root size, never an assumed 16px.
    const baseRoot = await rootFontSize(page);
    expect(baseRoot).toBeGreaterThan(0);

    await panel.locator(DRAFT).fill(DRAFT_TEXT);
    const failure = await failOneClaimRead(page, claimId);
    await panel.locator(REFRESH).click();

    const error = panel.locator(READ_ERROR);
    const retry = panel.locator(RETRY);
    await withReadSeam(failure, () => expect(error).toHaveCount(1));
    expect(failure.count()).toBe(1);

    const baseDiagnostics = await collectPanelDiagnostics(page, 'base');
    expect(baseDiagnostics.rootFontPx).toBeCloseTo(baseRoot, 1);
    await expectFitsWithoutOverflow(baseDiagnostics, [panel, error, retry, panel.locator(DRAFT)]);
    expectNotClippedInsidePanel(baseDiagnostics);

    // Local root text scale from the measured baseline, awaited to the real computed value.
    const scaledRoot = await activateRootFontScale(page, baseRoot);
    expect(scaledRoot).toBeCloseTo(baseRoot * 2, 1);

    const scaledDiagnostics = await collectPanelDiagnostics(page, 'scaled');
    expect(scaledDiagnostics.rootFontPx).toBeCloseTo(baseRoot * 2, 1);

    // Attached before the layout assertions so a real failure reports concrete values.
    await testInfo.attach('messaging-scale-metrics.json', {
      body: JSON.stringify(
        {
          baselineRootFontPx: baseRoot,
          targetRootFontPx: scaledRoot,
          base: baseDiagnostics,
          scaled: scaledDiagnostics,
        },
        null,
        2
      ),
      contentType: 'application/json',
    });
    await testInfo.attach('messaging-panel-scaled.png', {
      body: await panel.screenshot(),
      contentType: 'image/png',
    });

    const metrics = await expectFitsWithoutOverflow(scaledDiagnostics, [
      panel,
      error,
      retry,
      panel.locator(DRAFT),
    ]);
    expectNotClippedInsidePanel(scaledDiagnostics);
    testInfo.annotations.push({
      type: 'scaled-layout',
      description: `root:${scaledRoot}px base:${baseRoot}px client:${metrics.clientWidth}px clipped:${metrics.clipped} panel-scroll-h:${scaledDiagnostics.panel?.scrollHeight} panel-client-h:${scaledDiagnostics.panel?.clientHeight} base-panel-client-h:${baseDiagnostics.panel?.clientHeight} content-scroll-h:${scaledDiagnostics.content?.scrollHeight} content-client-h:${scaledDiagnostics.content?.clientHeight}`,
    });

    expectGenericFailureCopy(await error.innerText());
    await expect(panel.locator(DRAFT)).toHaveValue(DRAFT_TEXT);

    await failure.restore();
    await retry.focus();
    await page.keyboard.press('Enter');

    await expect(error).toHaveCount(0);
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await expect(panel.locator(DRAFT)).toHaveValue(DRAFT_TEXT);
  });
});
