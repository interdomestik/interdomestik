import { expect, type Page, type Request, type TestInfo } from '@playwright/test';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { gotoApp } from '../utils/navigation';
import { withContentPayloadCapture, type ContentPayloadCapture } from './content-payload-capture';
import type { PreviewAccess } from './nine-role-message-access.cases';
import type { PreviewFixture } from './nine-role-preview.fixture';
import { expectHandoffContentSearchEmpty } from './support-handoff-metadata.test-support';

export async function expectPreviewBoundaries(
  page: Page,
  info: TestInfo,
  access: PreviewAccess,
  fixture: PreviewFixture
) {
  await expectVerificationResponse(page, info, access, fixture);
  await expectVerificationPage(page, info, access, fixture);
  await expectHandoffBoundaries(page, info, access, fixture);
}

async function expectVerificationResponse(
  page: Page,
  info: TestInfo,
  access: PreviewAccess,
  fixture: PreviewFixture
) {
  const { origin } = getProjectUrlInfo(info, null);
  const response = await page.request.get(`${origin}/api/verification/${fixture.attemptId}`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(access.verificationStatus);
  if (access.verification === 'denied') {
    const payload = await response.text();
    for (const sentinel of fixture.verificationSentinels) expect(payload).not.toContain(sentinel);
  } else {
    const details = await response.json();
    if (access.verification === 'redacted') {
      expect(details.verificationNote).toBeNull();
      expect(
        details.timeline.every((event: { description?: string }) => event.description === undefined)
      ).toBe(true);
      for (const sentinel of fixture.verificationSentinels)
        expect(JSON.stringify(details)).not.toContain(sentinel);
    } else {
      expect(details.verificationNote).toBe(fixture.verificationSentinels[0]);
      expect(JSON.stringify(details)).toContain(fixture.verificationSentinels[1]);
    }
  }
}

async function expectVerificationPage(
  page: Page,
  info: TestInfo,
  access: PreviewAccess,
  fixture: PreviewFixture
) {
  if (access.verification !== 'redacted') return;
  const matches = (url: URL, request: Request) =>
    (request.resourceType() === 'document' && url.pathname.endsWith('/admin/leads')) ||
    (request.resourceType() === 'fetch' &&
      request.method() === 'GET' &&
      url.pathname === `/api/verification/${fixture.attemptId}`);
  await withContentPayloadCapture(
    page,
    { matches, sentinels: fixture.verificationSentinels },
    async capture => {
      // The drawer's finite JSON fetch must finish before capture cleanup can leave the page.
      const [details] = await Promise.all([
        page.waitForResponse(
          response =>
            matches(new URL(response.url()), response.request()) &&
            response.request().resourceType() === 'fetch'
        ),
        gotoApp(
          page,
          `/admin/leads?view=history&query=${encodeURIComponent(fixture.email)}&selected=${fixture.attemptId}`,
          info,
          { marker: 'verification-ops-page' }
        ),
      ]);
      expect(details.status()).toBe(200);
      await capture.settled();
      expect(capture.checkedPayloadCount, 'checked a visit payload').toBeGreaterThan(0);
      await expect(page.getByTestId('cash-verification-row').filter({ visible: true })).toHaveCount(
        1
      );
      await expect(page.getByTestId('ops-drawer').filter({ visible: true })).toBeVisible();
      await expect(
        page
          .getByTestId('ops-drawer')
          .filter({ visible: true })
          .getByText(fixture.email, { exact: true })
      ).toBeVisible();
      await expectHiddenSentinels(page, fixture.verificationSentinels);
    }
  );
}

async function expectHandoffBoundaries(
  page: Page,
  info: TestInfo,
  access: PreviewAccess,
  fixture: PreviewFixture
) {
  const search = access.handoffs === 'content' ? fixture.handoffSentinels[0] : fixture.handoffId;
  const path = `/staff/support-handoffs?status=all&search=${encodeURIComponent(search)}`;
  // Capture documents and finite detail actions. Refresh Flight GET capture is a tracked follow-up;
  // the router may abort those streams after applying them, so check their resulting DOM below.
  const matches = (url: URL, request: Request) =>
    url.pathname.endsWith('/staff/support-handoffs') &&
    (request.resourceType() === 'document' ||
      (request.resourceType() === 'fetch' &&
        request.method() === 'POST' &&
        Boolean(request.headers()['next-action'])));
  // Content readers must still receive their sentinels; metadata and denied readers must not.
  const sentinels = access.handoffs === 'content' ? [] : fixture.handoffSentinels;
  await withContentPayloadCapture(page, { matches, sentinels }, async capture => {
    const marker = access.handoffs === 'denied' ? 'not-found-page' : 'staff-page-ready';
    await gotoApp(page, path, info, { marker });
    await capture.settled();
    expect(capture.checkedPayloadCount, 'checked a visit payload').toBeGreaterThan(0);
    await expectHiddenSentinels(page, sentinels);
    if (access.handoffs === 'denied') {
      await expect(page.getByTestId('staff-support-handoffs-queue')).toHaveCount(0);
      return;
    }
    const row = page.getByTestId('staff-support-handoffs-row').filter({ visible: true });
    await expect(row).toHaveCount(1);
    const toggle = row.getByTestId('staff-support-handoff-detail-toggle');
    await toggle.focus();
    await capture.settled();
    const beforeDetail = capture.checkedPayloadCount;
    const detailUrl = page.url();
    const [detailReply] = await Promise.all([
      page.waitForResponse(
        res =>
          res.url() === detailUrl &&
          res.request().resourceType() === 'fetch' &&
          res.request().method() === 'POST' &&
          Boolean(res.request().headers()['next-action']) &&
          res.request().postData() === JSON.stringify([fixture.handoffId])
      ),
      toggle.press('Enter'),
    ]);
    // Use the same received bytes already checked by capture, before any later navigation.
    const actionText = await capture.checkedPayload(detailReply);
    await expect(row.getByTestId('staff-support-handoff-detail-panel')).toBeVisible();
    await capture.settled();
    expect(capture.checkedPayloadCount, 'checked a new detail payload').toBeGreaterThan(
      beforeDetail
    );
    if (access.handoffs === 'metadata') {
      await expect(
        row.getByTestId('staff-support-handoff-detail-panel').getByTestId('handoff-metadata-status')
      ).toBeVisible();
      await expect(toggle).toBeFocused();
      for (const sentinel of fixture.handoffSentinels) expect(actionText).not.toContain(sentinel);
      await expectHiddenSentinels(page, fixture.handoffSentinels);
      const metadata = handoffFlightResult(actionText) as {
        kind: string;
        result: { data: Record<string, unknown>[] };
      };
      expect(metadata).toMatchObject({ kind: 'metadata', result: { kind: 'ok' } });
      expect(metadata.result.data).toHaveLength(1);
      expect(metadata.result.data[0].id).toBe(fixture.handoffId);
      expect(Object.keys(metadata.result.data[0]).sort((a, b) => a.localeCompare(b))).toEqual(
        [
          'id',
          'status',
          'urgency',
          'staffId',
          'staffName',
          'branchId',
          'branchName',
          'createdAt',
          'updatedAt',
          'acceptedAt',
          'reassignedAt',
          'closedAt',
          'publicResponseAt',
          'publicResponseCount',
          'memberReplyAt',
        ].sort((a, b) => a.localeCompare(b))
      );
      const actionId = detailReply.request().headers()['next-action'];
      // The fixture owns one other-branch and one foreign-tenant handoff. Keep page navigation ordered.
      expect(fixture.deniedHandoffIds).toHaveLength(2);
      const [otherBranchId, foreignTenantId] = fixture.deniedHandoffIds;
      const sentinels = fixture.handoffSentinels;
      await expectDeniedHandoff(page, info, actionId, otherBranchId, capture, sentinels);
      await expectDeniedHandoff(page, info, actionId, foreignTenantId, capture, sentinels);
      await expectHandoffContentSearchEmpty(
        page,
        fixture.contentSearch,
        capture,
        fixture.handoffSentinels
      );
    } else {
      await expect(row).toContainText(fixture.handoffSentinels[0]);
      await Promise.all(
        fixture.handoffSentinels.slice(1).map(sentinel => expect(row).toContainText(sentinel))
      );
    }
  });
}

async function expectDeniedHandoff(
  page: Page,
  info: TestInfo,
  actionId: string,
  id: string,
  capture: ContentPayloadCapture,
  sentinels: readonly string[]
) {
  const { origin } = getProjectUrlInfo(info, null);
  // Directly probe both queue and detail with each foreign scope; own-ID filtering proves neither.
  const denied = await page.request.post(page.url(), {
    data: JSON.stringify([id]),
    headers: {
      'Next-Action': actionId,
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
      Origin: origin,
    },
  });
  expect(denied.status()).toBe(200);
  expect(handoffFlightResult(await denied.text())).toEqual({
    kind: 'metadata',
    result: { kind: 'ok', data: [] },
  });
  await capture.settled();
  const beforeVisit = capture.checkedPayloadCount;
  await gotoApp(page, `/staff/support-handoffs?status=all&search=${encodeURIComponent(id)}`, info, {
    marker: 'staff-page-ready',
  });
  await expect(page.getByTestId('staff-support-handoffs-empty')).toBeVisible();
  await expect(page.getByTestId('staff-support-handoffs-row')).toHaveCount(0);
  await capture.settled();
  expect(capture.checkedPayloadCount, 'checked a new denied-scope visit payload').toBeGreaterThan(
    beforeVisit
  );
  await expectHiddenSentinels(page, sentinels);
}

async function expectHiddenSentinels(page: Page, sentinels: readonly string[]) {
  await Promise.all(
    sentinels.map(sentinel => expect(page.locator('body')).not.toContainText(sentinel))
  );
}

/** Resolve the actual action record; metadata results have no messaging success flag. */
function handoffFlightResult(body: string): unknown {
  const lines = body.split(/\r?\n/);
  const rootLine = lines.find(line => line.startsWith('0:'));
  if (!rootLine) throw new Error('Missing handoff Flight root');
  const root = JSON.parse(rootLine.slice(2)) as { a?: string };
  const id = typeof root.a === 'string' ? /^\$@([\da-f]+)$/.exec(root.a)?.[1] : null;
  if (!id) throw new Error('Missing handoff Flight action reference');
  const result = lines.find(line => line.startsWith(`${id}:`));
  if (!result) throw new Error('Missing handoff Flight action result');
  return JSON.parse(result.slice(id.length + 1)) as unknown;
}
