import {
  E2E_CASE_FIXTURES,
  E2E_DISCOVERY_THREADS,
  E2E_RUNTIME_ROLES,
  E2E_USERS,
} from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { withPreviewSentinels } from './nine-role-preview.fixture';
import { expectPreviewBoundaries } from './nine-role-preview-probes';
import { previewAccessFor } from './nine-role-message-access.cases';
import { randomUUID } from 'node:crypto';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { isKsGateProject, isMkGateProject } from './gate-project-identity';
import { requireSeededHost, signInAs } from './nine-role-actor';
import {
  withClaimNoteSentinels,
  type MessageSentinelClaim,
} from './nine-role-message-notes.fixture';
import { withMessagingFixture, type ActionIds } from './messaging-session-revocation.fixture';
import { MessagingSessionTransport, parseFlightResult } from './messaging-session-transport';
import {
  KS_MESSAGE_CASES,
  MK_MESSAGE_CASES,
  MESSAGE_CASE_KEYS,
  type MessageActorCases,
  type MessageCaseKey,
} from './nine-role-message-access.cases';

function messages(key: MessageCaseKey) {
  return Object.values(E2E_DISCOVERY_THREADS[key]).flatMap(message =>
    message ? [message.row] : []
  );
}

async function action(page: Page, info: TestInfo, id: string, args: unknown[]) {
  const transport = new MessagingSessionTransport(
    getProjectUrlInfo(info, null).origin,
    info.project.use.extraHTTPHeaders
  );
  transport.replaceCookies(await page.context().cookies());
  return parseFlightResult(
    await transport.request(routes.partners(info), {
      method: 'POST',
      headers: {
        'Next-Action': id,
        'Content-Type': 'text/plain;charset=UTF-8',
        Accept: 'text/x-component',
      },
      body: JSON.stringify(args),
    })
  );
}

async function expectHistory(page: Page, info: TestInfo, ids: ActionIds, row: MessageActorCases) {
  for (const key of MESSAGE_CASE_KEYS) {
    const result = await action(page, info, ids.history, [E2E_CASE_FIXTURES[key].id]);
    if (!row.allowed.includes(key)) {
      expect(result.success, `${row.actor} ${key}`).toBe(false);
      expect(result.messages).toBeUndefined();
      for (const message of messages(key))
        expect(JSON.stringify(result)).not.toContain(message.content);
      continue;
    }
    expect(result.success, `${row.actor} ${key}`).toBe(true);
    for (const message of messages(key)) {
      const visible = !message.isInternal || row.internal;
      expect(
        result.messages?.some(item => item.id === message.id && item.content === message.content),
        `${row.actor} ${key} ${message.id}`
      ).toBe(visible);
    }
  }
}

async function expectManager(
  page: Page,
  info: TestInfo,
  ids: ActionIds,
  fixture: MessageSentinelClaim,
  allowed: boolean
) {
  const { claimId } = fixture;
  const history = await action(page, info, ids.history, [claimId]);
  expect(history.success).toBe(false);
  expect(history.messages).toBeUndefined();
  for (const sentinel of fixture.messages) expect(JSON.stringify(history)).not.toContain(sentinel);
  for (const internal of [false, true]) {
    const result = await action(page, info, ids.send, [
      claimId,
      `D1c forbidden ${randomUUID()}`,
      internal,
      randomUUID(),
    ]);
    expect(result).toEqual({ success: false, error: 'Access denied' });
  }
  for (const surface of ['admin', 'staff'] as const) {
    const path =
      surface === 'staff'
        ? routes.staffClaimDetail(claimId, info)
        : `/admin/claims/${encodeURIComponent(claimId)}`;
    const payloads: Promise<string>[] = [];
    const observe = (response: import('@playwright/test').Response) => {
      if (new URL(response.url()).pathname.includes(`/claims/${claimId}`)) {
        payloads.push(response.text());
      }
    };
    page.on('response', observe);
    try {
      await gotoApp(page, path, info, {
        marker: !allowed
          ? 'not-found-page'
          : surface === 'staff'
            ? 'staff-claim-detail-ready'
            : 'admin-page-ready',
      });
      const card = page.getByTestId('claim-message-summary').filter({ visible: true });
      const sentinels = [...fixture.messages, ...fixture.notes];
      if (!allowed) {
        const notFound = page.getByTestId('not-found-page').filter({ visible: true });
        await expect(notFound).toBeVisible();
        await expect(notFound).not.toContainText('Something went wrong!');
        await expect(card).toHaveCount(0);
        await expect(page.locator('body')).not.toContainText(claimId);
        const deniedPayloads = await Promise.all(payloads);
        expect(deniedPayloads.length).toBeGreaterThan(0);
        for (const sentinel of sentinels) {
          await expect(page.locator('body')).not.toContainText(sentinel);
          for (const payload of deniedPayloads) expect(payload).not.toContain(sentinel);
        }
        continue;
      }
      await expect(card).toBeVisible();
      await expect(card.getByTestId('claim-message-summary-count')).toHaveText(/^\d+$/);
      await expect(card.getByTestId('claim-message-summary-count')).toHaveText(
        String(fixture.messages.length)
      );
      await expect(card.getByTestId('claim-message-summary-last')).not.toBeEmpty();
      await expect(card.getByTestId('claim-message-summary-awaiting')).not.toBeEmpty();
      await expect(page.getByTestId('messaging-panel')).toHaveCount(0);
      await expect(page.getByTestId('message-input')).toHaveCount(0);
      await expect(page.getByTestId('send-message-button')).toHaveCount(0);
      await expect(page.getByTestId('staff-claim-detail-note')).toHaveCount(0);
      for (const sentinel of sentinels) {
        await expect(page.locator('body')).not.toContainText(sentinel);
        for (const payload of await Promise.all(payloads)) expect(payload).not.toContain(sentinel);
      }
      // The refresh control remains present across refreshed metadata, so keyboard focus survives.
      const refresh = card.getByRole('button');
      await refresh.focus();
      await expect(refresh).toBeFocused();
      const refreshed = page.waitForResponse(
        response =>
          new URL(response.url()).pathname.includes(`/claims/${claimId}`) &&
          response.request().headers()['rsc'] === '1'
      );
      await refresh.press('Enter');
      await refreshed;
      await expect(refresh).toHaveAttribute('aria-busy', 'false');
      await expect(refresh).toBeFocused();
      const renderedPayloads = await Promise.all(payloads);
      expect(renderedPayloads.length).toBeGreaterThan(0);
      for (const payload of renderedPayloads) {
        for (const sentinel of sentinels) expect(payload).not.toContain(sentinel);
      }
    } finally {
      page.off('response', observe);
    }
  }
}

function matrix(
  project: (name: string) => boolean,
  cases: readonly MessageActorCases[],
  key: MessageCaseKey
) {
  test(`${key} nine-role messaging boundaries`, async ({ page }, info) => {
    requireSeededHost(info, project, 240_000);
    // Existing isolated fixture discovers this build's real mounted action ids and cleans up.
    await withMessagingFixture(page, info, async (_fixture, ids) => {
      for (const [index, row] of cases.entries()) {
        await test.step(row.actor, async () => {
          await page.goto('about:blank');
          await signInAs(page, info, row.actor, `10.0.73.${index + 1}`);
          await expectHistory(page, info, ids, row);
          await withPreviewSentinels(key, fixture =>
            expectPreviewBoundaries(page, info, previewAccessFor(row.actor), fixture)
          );
          if (E2E_USERS[row.actor].dbRole === 'branch_manager') {
            if (!row.managerProbe) throw new Error('Missing manager probe scopes');
            await withClaimNoteSentinels(row.managerProbe, async fixtures => {
              await expectManager(page, info, ids, fixtures.own, true);
              await expectManager(page, info, ids, fixtures.foreign, false);
            });
          }
        });
      }
    });
  });
}

test.describe('nine-role message access matrix', () => {
  matrix(isKsGateProject, KS_MESSAGE_CASES, 'KS_ANCHOR');
  matrix(isMkGateProject, MK_MESSAGE_CASES, 'MK_FOREIGN_TENANT');
  test('preview admission distinguishes branchless staff from assigned staff', () => {
    expect(previewAccessFor('KS_STAFF_UNASSIGNED')).toEqual({
      handoffs: 'denied',
      verification: 'denied',
      verificationStatus: 404,
    });
    for (const actor of ['KS_STAFF', 'MK_STAFF'] as const) {
      expect(previewAccessFor(actor)).toEqual({
        handoffs: 'content',
        verification: 'content',
        verificationStatus: 200,
      });
    }
  });
  test('covers all nine roles and treats KS_ADMIN as tenant_admin with full content', () => {
    expect(
      new Set([...KS_MESSAGE_CASES, ...MK_MESSAGE_CASES].map(row => E2E_USERS[row.actor].dbRole))
    ).toEqual(new Set(E2E_RUNTIME_ROLES));
    expect(E2E_USERS.KS_ADMIN.dbRole).toBe('tenant_admin');
    expect(KS_MESSAGE_CASES.find(row => row.actor === 'KS_ADMIN')).toMatchObject({
      internal: true,
      allowed: expect.arrayContaining(['KS_ANCHOR', 'KS_OTHER_BRANCH']),
    });
  });
});
