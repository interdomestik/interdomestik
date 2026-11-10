import { expect, type Page, type TestInfo } from '@playwright/test';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withContentPayloadCapture, type ContentPayloadCapture } from './content-payload-capture';
import { openSupportHandoffDetail } from './support-handoff-response.test-support';

export async function expectHandoffContentSearchEmpty(
  page: Page,
  search: string,
  capture: ContentPayloadCapture
): Promise<void> {
  // The form echoes its query. A proper prefix avoids echoing a forbidden full sentinel
  // and broadens the substring search, so an empty result proves at least as much.
  expect(search.length, 'content-only search has a nonempty proper prefix').toBeGreaterThan(1);
  const query = search.slice(0, -1);
  await page.getByTestId('staff-support-handoffs-search-input').fill(query);
  const beforeSearch = capture.checkedPayloadCount;
  await Promise.all([
    page.waitForURL(
      url =>
        url.href.includes('/staff/support-handoffs') && url.searchParams.get('search') === query
    ),
    page.getByTestId('staff-support-handoffs-search-submit').click(),
  ]);
  await expect(page.getByTestId('staff-support-handoffs-empty')).toBeVisible();
  await expect(page.getByTestId('staff-support-handoffs-row')).toHaveCount(0);
  expect(capture.checkedPayloadCount, 'checked a new search payload').toBeGreaterThan(beforeSearch);
}

export async function expectManagerHandoffMetadata(
  page: Page,
  info: TestInfo,
  handoffId: string,
  content: readonly string[]
) {
  const matches = (url: URL) => url.href.includes('/staff/support-handoffs');
  await withContentPayloadCapture(page, { matches, sentinels: content }, async capture => {
    await gotoApp(
      page,
      `${routes.staffSupportHandoffs(info)}?status=accepted&search=${encodeURIComponent(handoffId)}`,
      info,
      { marker: 'staff-page-ready' }
    );
    expect(capture.checkedPayloadCount, 'checked a visit payload').toBeGreaterThan(0);
    const row = page
      .getByTestId('staff-support-handoffs-row')
      .filter({ visible: true })
      .and(page.locator(`[data-handoff-id="${handoffId}"]`));
    await expect(row).toBeVisible();
    await expect(row.getByTestId('handoff-metadata-publicResponseCount')).toHaveText('2');
    const beforeDetail = capture.checkedPayloadCount;
    await openSupportHandoffDetail(row);
    const panel = row.getByTestId('staff-support-handoff-detail-panel');
    await expect(panel.getByTestId('handoff-metadata-status')).toBeVisible();
    await expect(panel.getByTestId('handoff-metadata-publicResponseCount')).toHaveText('2');
    // Returned metadata renders only after its checked response is delivered.
    expect(capture.checkedPayloadCount, 'checked a new detail payload').toBeGreaterThan(
      beforeDetail
    );
    await Promise.all(
      [
        'staff-support-handoff-public-response-existing',
        'staff-support-handoff-public-response-acknowledged',
        'staff-support-handoff-public-response-form',
        'staff-support-handoff-public-response-input',
        'handoff-member-reply',
        'staff-support-handoff-full-message',
      ].map(testId => expect(row.getByTestId(testId)).toHaveCount(0))
    );
    await Promise.all(
      content.map(sentinel => expect(page.locator('body')).not.toContainText(sentinel))
    );
    // A content-only search must not find this handoff or reveal its existence.
    await expectHandoffContentSearchEmpty(page, content[0], capture);
  });
}
