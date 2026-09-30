import { expect, type Page, type Route } from '@playwright/test';

/** Exercise both unknown outcomes and inspect history without navigating the retained form. */
export async function verifyStatusTransportRecovery(
  page: Page,
  claimId: string,
  publicNote: string,
  beforeCommittedHistory: () => Promise<string>
): Promise<void> {
  const detail = page.getByTestId('staff-claim-detail-ready').first();
  const save = detail.getByTestId('staff-update-claim-button');
  const historyLink = detail.getByTestId('staff-check-status-history');
  const pattern = `**/staff/claims/${claimId}*`;
  let writes = 0;
  let refreshReads = 0;
  let failedHistoryReads = 0;
  const failHistory = async (route: Route) => {
    await route.abort('failed');
    failedHistoryReads += 1;
  };
  const intercept = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      writes += 1;
      if (writes === 2) {
        const response = await route.fetch({ maxRetries: 0 });
        expect(response.ok()).toBe(true);
        await response.dispose();
      }
      await route.abort('failed');
    } else {
      if (request.headers().rsc === '1') refreshReads += 1;
      await route.continue();
    }
  };
  const inspectHistory = async () => {
    const popup = page.waitForEvent('popup');
    await historyLink.click();
    return popup;
  };
  await page.route(pattern, intercept);
  try {
    await save.click();
    await expect(detail.getByTestId('staff-status-save-recovery')).toBeVisible();
    await expect(save).toBeDisabled();
    // Even failed history navigation happens in a separate tab; the draft stays mounted.
    await page.context().route(pattern, failHistory);
    const failedHistory = await inspectHistory();
    await expect.poll(() => failedHistoryReads).toBe(1);
    await page.context().unroute(pattern, failHistory);
    await failedHistory.close();
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
    await save.click();
    await expect(detail.getByTestId('staff-status-save-recovery')).toBeVisible();
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
    await page.context().unroute(pattern, failHistory);
    await page.unroute(pattern, intercept);
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
