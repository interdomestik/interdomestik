import { expect, type Page, type TestInfo, type Response } from '@playwright/test';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { openSupportHandoffDetail } from './support-handoff-response.test-support';

export async function expectManagerHandoffMetadata(
  page: Page,
  info: TestInfo,
  handoffId: string,
  content: readonly string[]
) {
  const payloads: Promise<string>[] = [];
  const observe = (response: Response) => {
    if (response.url().includes('/staff/support-handoffs')) payloads.push(response.text());
  };
  page.on('response', observe);
  try {
    await gotoApp(
      page,
      `${routes.staffSupportHandoffs(info)}?status=accepted&search=${encodeURIComponent(handoffId)}`,
      info,
      { marker: 'staff-page-ready' }
    );
    const row = page
      .getByTestId('staff-support-handoffs-row')
      .filter({ visible: true })
      .and(page.locator(`[data-handoff-id="${handoffId}"]`));
    await expect(row).toBeVisible();
    await expect(row.getByTestId('handoff-metadata-publicResponseCount')).toHaveText('2');
    await openSupportHandoffDetail(row);
    const panel = row.getByTestId('staff-support-handoff-detail-panel');
    await expect(panel.getByTestId('handoff-metadata-status')).toBeVisible();
    await expect(panel.getByTestId('handoff-metadata-publicResponseCount')).toHaveText('2');
    for (const testId of [
      'staff-support-handoff-public-response-existing',
      'staff-support-handoff-public-response-acknowledged',
      'staff-support-handoff-public-response-form',
      'staff-support-handoff-public-response-input',
      'handoff-member-reply',
      'staff-support-handoff-full-message',
    ])
      await expect(row.getByTestId(testId)).toHaveCount(0);
    const bodies = await Promise.all(payloads);
    for (const sentinel of content) {
      await expect(page.locator('body')).not.toContainText(sentinel);
      for (const body of bodies) expect(body).not.toContain(sentinel);
    }
    // A content-only search must not find this handoff or reveal its existence.
    await page.getByTestId('staff-support-handoffs-search-input').fill(content[0]);
    await page.getByTestId('staff-support-handoffs-search-submit').click();
    await expect(page.getByTestId('staff-support-handoffs-empty')).toBeVisible();
    await expect(page.getByTestId('staff-support-handoffs-row')).toHaveCount(0);
  } finally {
    page.off('response', observe);
  }
}
