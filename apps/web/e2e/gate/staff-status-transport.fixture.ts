import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { createSignal, withSignalTimeout, type WaitForSignal } from './signal-wait.fixture';

const SAVE_CLICK_TIMEOUT_MS = 10_000;
const SAVE_RESPONSE_TIMEOUT_MS = 15_000;
const SAVE_RECOVERY_TIMEOUT_MS = 10_000;
const ROUTE_TEARDOWN_TIMEOUT_MS = 5_000;

async function withHistoryPopup(
  page: Page,
  historyLink: Locator,
  waitForSignal: WaitForSignal,
  phase: string,
  inspect: (popup: Page, remaining: () => number) => Promise<void>
): Promise<void> {
  const opened = createSignal<Page>();
  page.once('popup', opened.resolve);
  try {
    const popup = await waitForSignal(phase, async remaining => {
      const [popup] = await Promise.all([
        opened.promise,
        historyLink.click({ timeout: remaining() }),
      ]);
      await inspect(popup, remaining);
      return popup;
    });
    await withSignalTimeout('Close staff history popup', ROUTE_TEARDOWN_TIMEOUT_MS, () =>
      popup.close()
    );
  } catch (error) {
    // Closing the owning context cancels a click that could still open a popup and closes
    // any popup whose event arrives while the context shuts down.
    await withSignalTimeout('Cancel staff history popup', ROUTE_TEARDOWN_TIMEOUT_MS, () =>
      page.context().close()
    );
    page.off('popup', opened.resolve);
    throw error;
  }
}

async function inspectFailedHistory(
  page: Page,
  historyLink: Locator,
  pattern: string,
  waitForSignal: WaitForSignal
): Promise<void> {
  const target = new URL(page.url());
  const aborted = createSignal<void>();
  // Observe an abort failure even if it arrives before the popup event.
  void aborted.promise.catch(() => undefined);
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
  await withHistoryPopup(
    page,
    historyLink,
    waitForSignal,
    'Open staff status-history popup and abort its navigation',
    async () => {
      await aborted.promise;
      expect(failedHistoryReads).toBe(1);
    }
  );
  await withSignalTimeout('Remove failed staff history route', ROUTE_TEARDOWN_TIMEOUT_MS, () =>
    context.unroute(pattern, failHistory)
  );
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
    try {
      await waitForSignal(phase, async remaining => {
        await Promise.all([
          aborted.promise,
          save.click({ timeout: Math.min(remaining(), SAVE_CLICK_TIMEOUT_MS) }),
        ]);
        await expect(recovery).toBeVisible({
          timeout: Math.min(remaining(), SAVE_RECOVERY_TIMEOUT_MS),
        });
      });
    } catch (error) {
      await withSignalTimeout('Cancel staff status save', ROUTE_TEARDOWN_TIMEOUT_MS, () =>
        page.context().close()
      );
      throw error;
    }
  };
  await page.route(pattern, intercept);
  try {
    await saveWithRecovery('Recover after aborting the staff status save before forwarding');
    await expect(save).toBeDisabled();
    // Even failed history navigation happens in a separate tab; the draft stays mounted.
    await inspectFailedHistory(page, historyLink, pattern, waitForSignal);
    await expect(detail.getByLabel('Shënim statusi')).toHaveValue(publicNote);
    await expect(save).toBeDisabled();
    await withHistoryPopup(
      page,
      historyLink,
      waitForSignal,
      'Verify staff history after the unforwarded save',
      async (popup, remaining) => {
        const firstDetail = popup.getByTestId('staff-claim-detail-ready').first();
        await expect(firstDetail).toBeVisible({ timeout: remaining() });
        await expect(firstDetail.getByTestId('staff-status-history')).not.toContainText(
          publicNote,
          { timeout: remaining() }
        );
      }
    );
    await detail.getByTestId('staff-status-history-checked').click();
    await expect(save).toBeEnabled();
    expect(writes).toBe(1);
    await saveWithRecovery('Recover after dropping the staff status save response');
    await expect(save).toBeDisabled();
    const newerNote = await beforeCommittedHistory();
    await withHistoryPopup(
      page,
      historyLink,
      waitForSignal,
      'Verify staff history after the committed save',
      async (popup, remaining) => {
        const committedDetail = popup.getByTestId('staff-claim-detail-ready').first();
        const note = committedDetail.getByTestId('staff-claim-detail-note');
        const history = committedDetail.getByTestId('staff-status-history');
        await expect(note).toContainText(newerNote, { timeout: remaining() });
        await expect(note).not.toContainText(publicNote, { timeout: remaining() });
        await expect(history).toContainText(publicNote, { timeout: remaining() });
        await expect(history).toContainText(newerNote, { timeout: remaining() });
      }
    );
    await expect(detail.getByLabel('Shënim statusi')).toHaveValue(publicNote);
    await expect(detail.locator('#claim-status-select')).toContainText('Verifikim');
    await expect(save).toBeDisabled();
    expect(writes).toBe(2);
    expect(refreshReads).toBe(0);
  } finally {
    if (!page.isClosed()) {
      try {
        await withSignalTimeout('Drain staff status routes', ROUTE_TEARDOWN_TIMEOUT_MS, () =>
          page.unrouteAll({ behavior: 'wait' })
        );
      } catch (error) {
        await withSignalTimeout('Cancel staff status routes', ROUTE_TEARDOWN_TIMEOUT_MS, () =>
          page.context().close()
        );
        throw error;
      }
    }
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
