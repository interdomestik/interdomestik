import { expect, type Page, type Route } from '@playwright/test';
import sqAgentClaims from '../../src/messages/sq/agent-claims.json';

/** Exercise both unknown outcomes without automatically replaying either write. */
export async function verifyStatusTransportRecovery(
  page: Page,
  claimId: string,
  publicNote: string
): Promise<void> {
  const detail = page.getByTestId('staff-claim-detail-ready').first();
  const save = detail.getByTestId('staff-update-claim-button');
  const pattern = `**/staff/claims/${claimId}*`;
  let writes = 0;
  let refreshReads = 0;
  let releaseRefresh: () => void = () => {};
  let refreshBarrier: Promise<void>;
  const holdRefresh = () => {
    refreshBarrier = new Promise<void>(resolve => {
      releaseRefresh = resolve;
    });
  };
  const intercept = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      writes += 1;
      if (writes === 2) {
        // Commit once on the server, but lose its response at the browser boundary.
        const response = await route.fetch({ maxRetries: 0 });
        expect(response.ok()).toBe(true);
        await response.dispose();
      }
      await route.abort('failed');
    } else if (writes > 0 && request.method() === 'GET' && request.headers().rsc === '1') {
      refreshReads += 1;
      await refreshBarrier;
      await route.continue();
    } else {
      await route.continue();
    }
  };
  await page.route(pattern, intercept);
  try {
    for (const attempt of [1, 2]) {
      holdRefresh();
      await save.click();
      await expect.poll(() => refreshReads).toBe(attempt);
      await expect(save).toBeDisabled();
      await expect(detail.getByLabel('Shënim statusi')).toHaveValue(publicNote);
      await expect(detail.locator('#claim-status-select')).toContainText('Verifikim');
      await expect(
        page.getByText(
          sqAgentClaims['agent-claims'].claims.staff_actions.error.status_save_unconfirmed,
          { exact: true }
        )
      ).toBeVisible();
      expect(writes).toBe(attempt);
      releaseRefresh();
      await expect(save).toBeEnabled();
    }
    await expect(detail.getByTestId('staff-claim-detail-note')).toContainText(publicNote);
    await expect(detail.getByLabel('Shënim statusi')).toHaveValue(publicNote);
    expect(writes).toBe(2);
    // After checking reconciled history, discard the already-saved draft instead of replaying it.
    await detail.getByLabel('Shënim statusi').fill('');
    await expect(save).toBeDisabled();
  } finally {
    releaseRefresh();
    await page.unroute(pattern, intercept);
  }
}
