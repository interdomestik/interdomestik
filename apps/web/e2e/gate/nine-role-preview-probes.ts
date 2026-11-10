import { expect, type Page, type TestInfo, type Response } from '@playwright/test';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { gotoApp } from '../utils/navigation';
import type { PreviewAccess } from './nine-role-message-access.cases';
import type { PreviewFixture } from './nine-role-preview.fixture';

export async function expectPreviewBoundaries(
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
  if (access.verification === 'redacted') {
    const payloads: Promise<string>[] = [];
    const observe = (res: Response) => {
      if (res.url().includes('/admin/leads') || res.url().includes('/api/verification/'))
        payloads.push(res.text());
    };
    page.on('response', observe);
    try {
      await gotoApp(
        page,
        `/admin/leads?view=history&query=${encodeURIComponent(fixture.email)}&selected=${fixture.attemptId}`,
        info,
        { marker: 'verification-ops-page' }
      );
      await expect(page.getByTestId('cash-verification-row').filter({ visible: true })).toHaveCount(
        1
      );
      await expect(page.getByTestId('ops-drawer').filter({ visible: true })).toBeVisible();
      for (const sentinel of fixture.verificationSentinels) {
        await expect(page.locator('body')).not.toContainText(sentinel);
        for (const body of await Promise.all(payloads)) expect(body).not.toContain(sentinel);
      }
    } finally {
      page.off('response', observe);
    }
  }
  const search = access.handoffs === 'content' ? fixture.handoffSentinels[0] : fixture.handoffId;
  const path = `/staff/support-handoffs?status=all&search=${encodeURIComponent(search)}`;
  if (access.handoffs === 'denied') {
    await gotoApp(page, path, info, { marker: 'not-found-page' });
    await expect(page.getByTestId('staff-support-handoffs-queue')).toHaveCount(0);
    return;
  }
  const payloads: Promise<string>[] = [];
  const observe = (res: Response) => {
    if (res.url().includes('/staff/support-handoffs')) payloads.push(res.text());
  };
  page.on('response', observe);
  try {
    await gotoApp(page, path, info, { marker: 'staff-page-ready' });
    const row = page.getByTestId('staff-support-handoffs-row').filter({ visible: true });
    await expect(row).toHaveCount(1);
    const toggle = row.getByTestId('staff-support-handoff-detail-toggle');
    await toggle.focus();
    const actionReply = page.waitForResponse(
      res => res.request().method() === 'POST' && Boolean(res.request().headers()['next-action'])
    );
    await toggle.press('Enter');
    const detailReply = await actionReply;
    const actionText = await detailReply.text();
    await expect(row.getByTestId('staff-support-handoff-detail-panel')).toBeVisible();
    if (access.handoffs === 'metadata') {
      await expect(
        row.getByTestId('staff-support-handoff-detail-panel').getByTestId('handoff-metadata-status')
      ).toBeVisible();
      await expect(toggle).toBeFocused();
      for (const sentinel of fixture.handoffSentinels) {
        expect(actionText).not.toContain(sentinel);
        await expect(page.locator('body')).not.toContainText(sentinel);
        for (const payload of await Promise.all(payloads)) expect(payload).not.toContain(sentinel);
      }
      const metadata = handoffFlightResult(actionText) as {
        result: { data: Record<string, unknown>[] };
      };
      expect(Object.keys(metadata.result.data[0]).sort()).toEqual(
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
        ].sort()
      );
      const actionId = detailReply.request().headers()['next-action'];
      for (const id of fixture.deniedHandoffIds) {
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
        await gotoApp(
          page,
          `/staff/support-handoffs?status=all&search=${encodeURIComponent(id)}`,
          info,
          { marker: 'staff-page-ready' }
        );
        await expect(page.getByTestId('staff-support-handoffs-empty')).toBeVisible();
        await expect(page.getByTestId('staff-support-handoffs-row')).toHaveCount(0);
      }
      await page.getByTestId('staff-support-handoffs-search-input').fill(fixture.contentSearch);
      await page.getByTestId('staff-support-handoffs-search-submit').click();
      await expect(page.getByTestId('staff-support-handoffs-empty')).toBeVisible();
      await expect(page.getByTestId('staff-support-handoffs-row')).toHaveCount(0);
    } else {
      await expect(row).toContainText(fixture.handoffSentinels[0]);
      for (const sentinel of fixture.handoffSentinels.slice(1))
        await expect(row).toContainText(sentinel);
    }
  } finally {
    page.off('response', observe);
  }
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
