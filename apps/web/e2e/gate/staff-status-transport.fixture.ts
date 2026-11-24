import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { createSignal, type WaitForSignal } from './signal-wait.fixture';

const SAVE_CLICK_TIMEOUT_MS = 10_000;
const SAVE_RESPONSE_TIMEOUT_MS = 15_000;
const SAVE_RECOVERY_TIMEOUT_MS = 10_000;

async function inspectFailedHistory(
  page: Page,
  historyLink: Locator,
  pattern: string,
  waitForSignal: WaitForSignal
): Promise<void> {
  const target = new URL(page.url());
  const aborted = createSignal<void>();
  const opened = createSignal<void>();
  let failedPopup: Page | undefined;
  const observePopup = (popup: Page) => {
    failedPopup = popup;
    opened.resolve();
  };
  let failedHistoryReads = 0;
  const failHistory = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() !== 'GET' ||
      !request.isNavigationRequest() ||
      url.origin !== target.origin ||
      url.pathname !== target.pathname ||
      url.search !== ''
    ) {
      await route.fallback();
      return;
    }
    try {
      await route.abort('failed');
      failedHistoryReads += 1;
      aborted.resolve();
    } catch (error) {
      aborted.reject(error);
    }
  };
  const context = page.context();
  await context.route(pattern, failHistory);
  page.once('popup', observePopup);
  try {
    await waitForSignal(
      'Open staff status-history popup and abort its navigation',
      Promise.all([opened.promise, aborted.promise, historyLink.click()])
    );
    expect(failedHistoryReads).toBe(1);
  } finally {
    page.off('popup', observePopup);
    try {
      await context.unroute(pattern, failHistory);
    } finally {
      await failedPopup?.close();
    }
  }
}

/** Exercise both unknown outcomes and inspect history without navigating the retained form. */
export async function verifyStatusTransportRecovery(
  page: Page,
  claimId: string,
  publicNote: string,
  waitForSignal: WaitForSignal,
  beforeCommittedHistory: () => Promise<string>
): Promise<void> {
  const detail = page.getByTestId('staff-claim-detail-ready').first();
  const save = detail.getByTestId('staff-update-claim-button');
  const recovery = detail.getByTestId('staff-status-save-recovery');
  const historyLink = detail.getByTestId('staff-check-status-history');
  const pattern = `**/staff/claims/${claimId}*`;
  let writes = 0;
  let refreshReads = 0;
  let saveAborted: ReturnType<typeof createSignal<void>> | undefined;
  const intercept = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      const aborted = saveAborted;
      saveAborted = undefined;
      writes += 1;
      try {
        try {
          if (writes === 2) {
            const response = await route.fetch({
              maxRetries: 0,
              timeout: SAVE_RESPONSE_TIMEOUT_MS,
            });
            const ok = response.ok();
            await response.dispose();
            expect(ok).toBe(true);
          }
        } finally {
          await route.abort('failed');
        }
        aborted?.resolve();
      } catch (error) {
        if (!aborted) throw error;
        aborted.reject(error);
      }
    } else {
      if (request.headers().rsc === '1') refreshReads += 1;
      await route.continue();
    }
  };
  const saveWithRecovery = async (phase: string) => {
    const aborted = createSignal<void>();
    saveAborted = aborted;
    const click = save.click({ timeout: SAVE_CLICK_TIMEOUT_MS });
    try {
      await waitForSignal(
        phase,
        Promise.all([aborted.promise, click]).then(() =>
          expect(recovery).toBeVisible({ timeout: SAVE_RECOVERY_TIMEOUT_MS })
        )
      );
    } finally {
      // Let an already-started click settle before the save route is removed.
      await Promise.allSettled([click]);
    }
  };
  const inspectHistory = async () => {
    const popup = page.waitForEvent('popup');
    await historyLink.click();
    return popup;
  };
  await page.route(pattern, intercept);
  try {
    await saveWithRecovery('Recover after aborting the staff status save before forwarding');
    await expect(save).toBeDisabled();
    // Even failed history navigation happens in a separate tab; the draft stays mounted.
    await inspectFailedHistory(page, historyLink, pattern, waitForSignal);
    await expect(detail.getByLabel('Shënim statusi')).toHaveValue(publicNote);
    await expect(save).toBeDisabled();
    const firstHistory = await inspectHistory();
    const firstDetail = firstHistory.getByTestId('staff-claim-detail-ready').first();
    await expect(firstDetail).toBeVisible();
    await expect(firstDetail.getByTestId('staff-status-history')).not.toContainText(publicNote);
    await firstHistory.close();
    await detail.getByTestId('staff-status-history-checked').click();
    await expect(save).toBeEnabled();
    expect(writes).toBe(1);
    await saveWithRecovery('Recover after dropping the staff status save response');
    await expect(save).toBeDisabled();
    const newerNote = await beforeCommittedHistory();
    const committedHistory = await inspectHistory();
    const committedDetail = committedHistory.getByTestId('staff-claim-detail-ready').first();
    await expect(committedDetail.getByTestId('staff-claim-detail-note')).toContainText(newerNote);
    await expect(committedDetail.getByTestId('staff-claim-detail-note')).not.toContainText(
      publicNote
    );
    await expect(committedDetail.getByTestId('staff-status-history')).toContainText(publicNote);
    await expect(committedDetail.getByTestId('staff-status-history')).toContainText(newerNote);
    await committedHistory.close();
    await expect(detail.getByLabel('Shënim statusi')).toHaveValue(publicNote);
    await expect(detail.locator('#claim-status-select')).toContainText('Verifikim');
    await expect(save).toBeDisabled();
    expect(writes).toBe(2);
    expect(refreshReads).toBe(0);
  } finally {
    // This staff fixture owns the page routes. Let the forwarded write finish before cleanup.
    await page.unrouteAll({ behavior: 'wait' });
  }
}

/** Exercise an authenticated staff action in another tab. */
export async function saveInterveningPublicNote(page: Page, note: string): Promise<void> {
  const otherStaffTab = await page.context().newPage();
  try {
    await otherStaffTab.goto(page.url());
    const detail = otherStaffTab.getByTestId('staff-claim-detail-ready').first();
    await expect(detail).toBeVisible();
    await detail.getByLabel('Shënim statusi').fill(note);
    await detail.getByTestId('staff-update-claim-button').click();
    await expect(detail.getByTestId('staff-claim-detail-note')).toContainText(note);
  } finally {
    await otherStaffTab.close();
  }
}
