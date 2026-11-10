import {
  E2E_CASE_FIXTURES,
  E2E_DISCOVERY_THREADS,
  E2E_RUNTIME_ROLES,
  E2E_USERS,
} from '@interdomestik/database';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withContentPayloadCapture } from './content-payload-capture';
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

function managerMarker(surface: 'admin' | 'staff', allowed: boolean): string {
  if (!allowed) return 'not-found-page';
  return surface === 'staff' ? 'staff-claim-detail-ready' : 'admin-page-ready';
}

async function expectBodyOmitsSentinels(page: Page, sentinels: readonly string[]) {
  // These assertions only read the current page; navigation and refresh remain sequential.
  await Promise.all(
    sentinels.map(sentinel => expect(page.locator('body')).not.toContainText(sentinel))
  );
}

async function expectManagerRefresh(
  page: Page,
  card: Locator,
  claimId: string,
  sentinels: readonly string[]
) {
  // The refresh control remains present across refreshed metadata, so keyboard focus survives.
  const refresh = card.getByRole('button');
  await refresh.focus();
  await expect(refresh).toBeFocused();
  const [refreshed] = await Promise.all([
    page.waitForResponse(
      response =>
        new URL(response.url()).pathname.includes(`/claims/${claimId}`) &&
        response.request().headers()['rsc'] === '1'
    ),
    refresh.press('Enter'),
  ]);
  expect(refreshed.status()).toBe(200);
  await expect(refresh).toHaveAttribute('aria-busy', 'false');
  await expect(refresh).toBeFocused();
  // Scope: this checks the refreshed DOM only, not the refresh Flight body. The router can abort that
  // stream after applying it, so Chromium cannot return its bytes; passive CDP stream capture of
  // refresh payloads is a tracked follow-up. Document payloads are checked byte-for-byte above.
  await expectBodyOmitsSentinels(page, sentinels);
  await expect(card.getByTestId('claim-message-summary-count')).toHaveText(/^\d+$/);
}

async function expectManagerSurface(
  page: Page,
  info: TestInfo,
  fixture: MessageSentinelClaim,
  allowed: boolean,
  surface: 'admin' | 'staff'
) {
  const { claimId } = fixture;
  const path =
    surface === 'staff'
      ? routes.staffClaimDetail(claimId, info)
      : `/admin/claims/${encodeURIComponent(claimId)}`;
  const sentinels = [...fixture.messages, ...fixture.notes];
  // Documents carry the full server render and complete before the test moves on.
  const matchesClaim = (url: URL, request: Request) =>
    request.resourceType() === 'document' &&
    url.pathname.includes('/claims/') &&
    url.pathname.split('/').includes(claimId);
  await withContentPayloadCapture(page, { matches: matchesClaim, sentinels }, async capture => {
    await gotoApp(page, path, info, { marker: managerMarker(surface, allowed) });
    await capture.settled();
    expect(capture.checkedPayloadCount, 'checked a visit payload').toBeGreaterThan(0);
    const card = page.getByTestId('claim-message-summary').filter({ visible: true });
    if (!allowed) {
      const notFound = page.getByTestId('not-found-page').filter({ visible: true });
      await expect(notFound).toBeVisible();
      await expect(notFound).not.toContainText('Something went wrong!');
      await expect(card).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(claimId);
      await expectBodyOmitsSentinels(page, sentinels);
      return;
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
    await expectBodyOmitsSentinels(page, sentinels);
    await expectManagerRefresh(page, card, claimId, sentinels);
  });
}

async function expectManagerSendDenied(
  page: Page,
  info: TestInfo,
  ids: ActionIds,
  claimId: string,
  internal: boolean
) {
  const result = await action(page, info, ids.send, [
    claimId,
    `D1c forbidden ${randomUUID()}`,
    internal,
    randomUUID(),
  ]);
  expect(result).toEqual({ success: false, error: 'Access denied' });
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
  await expectManagerSendDenied(page, info, ids, claimId, false);
  await expectManagerSendDenied(page, info, ids, claimId, true);
  await expectManagerSurface(page, info, fixture, allowed, 'admin');
  await expectManagerSurface(page, info, fixture, allowed, 'staff');
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
