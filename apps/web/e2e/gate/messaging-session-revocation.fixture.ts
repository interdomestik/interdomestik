import {
  auditLog,
  claimMessages,
  dbAdmin,
  E2E_PASSWORD,
  notifications,
  session,
} from '@interdomestik/database';
import { expect, type Page, type Request, type TestInfo } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  withAgentMessageFixture,
  type AgentMessageFixture,
} from './agent-message-visibility.fixture';
import { inSequence } from './in-sequence';
import {
  MessagingSessionTransport,
  parseFlightResult,
  type ActionResult,
} from './messaging-session-transport';

export type Operation = 'history' | 'send' | 'receipt';
export type ActionIds = Record<Operation, string>;
const transports = new WeakMap<Page, MessagingSessionTransport>();

export function transportFor(page: Page, info: TestInfo): MessagingSessionTransport {
  let transport = transports.get(page);
  if (!transport) {
    transport = new MessagingSessionTransport(
      getProjectUrlInfo(info, null).origin,
      info.project.use.extraHTTPHeaders
    );
    transports.set(page, transport);
  }
  return transport;
}

export function authPost(page: Page, info: TestInfo, path: string, data: object) {
  return transportFor(page, info).auth(path, data);
}

export async function loginFixture(page: Page, info: TestInfo, email: string, userId: string) {
  await page.context().clearCookies();
  const transport = transportFor(page, info);
  transport.replaceCookies([]);
  const response = await authPost(page, info, 'sign-in/email', {
    email,
    password: E2E_PASSWORD,
  });
  expect(response.ok, 'synthetic login succeeded').toBe(true);
  expect(response.userId).toBe(userId);
  await page.context().addCookies(transport.cookies());
}

function observeAction(ids: Partial<ActionIds>, claimId: string, request: Request): void {
  const id = request.headers()['next-action'];
  if (request.method() !== 'POST' || !id) return;
  let args: unknown;
  try {
    args = JSON.parse(request.postData() ?? 'null');
  } catch {
    return;
  }
  if (!Array.isArray(args)) return;
  if (args.length === 1 && args[0] === claimId) ids.history = id;
  if (args.length >= 3 && args[0] === claimId) ids.send = id;
  if (args.length === 1 && Array.isArray(args[0])) ids.receipt = id;
}

/** Learn current-build action references from the shipped UI; no manifest or auth test seam. */
async function captureActions(page: Page, info: TestInfo, fixture: AgentMessageFixture) {
  const claimId = fixture.claimIds[0];
  const ids: Partial<ActionIds> = {};
  const observe = (request: Request) => observeAction(ids, claimId, request);
  page.on('request', observe);
  try {
    await loginFixture(page, info, fixture.email, fixture.agentId);
    await gotoApp(page, `${routes.agentWorkspaceClaims(info)}?claimId=${claimId}`, info, {
      marker: 'agent-claims-pro-page',
    });
    await page.locator('[data-testid="ops-drawer"]:visible').getByTestId('action-message').click();
    const panel = page.getByTestId('messaging-panel');
    await expect(panel).toContainText('S1 public incoming');
    await panel.getByTestId('messaging-refresh').click();
    await expect.poll(() => Boolean(ids.history && ids.receipt)).toBe(true);
    const content = `U3-2 action discovery ${claimId}`;
    await panel.getByTestId('message-input').fill(content);
    await panel.getByTestId('send-message-button').click();
    await expect(panel).toContainText(content);
    await expect.poll(() => Boolean(ids.send)).toBe(true);
    await expect.poll(async () => (await messagingSnapshot(fixture)).audits.length).toBe(1);
    await page.goto('about:blank');
    if (!ids.history || !ids.send || !ids.receipt)
      throw new Error('Messaging action discovery failed');
    return { history: ids.history, send: ids.send, receipt: ids.receipt };
  } finally {
    page.off('request', observe);
  }
}

/** Public page avoids portal guards and auth-page redirects; action admission still runs. */
export async function callMessaging(
  page: Page,
  info: TestInfo,
  ids: ActionIds,
  operation: Operation,
  fixture: AgentMessageFixture,
  messageIds: string[]
): Promise<ActionResult> {
  let args: unknown[] = [fixture.claimIds[0]];
  if (operation === 'send')
    args = [fixture.claimIds[0], `U3-2 probe ${randomUUID()}`, false, randomUUID()];
  if (operation === 'receipt') args = [messageIds];
  const response = await transportFor(page, info).request(routes.partners(info), {
    method: 'POST',
    headers: {
      'Next-Action': ids[operation],
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
    },
    body: JSON.stringify(args),
  });
  expect(response.status, `${operation} action transport`).toBe(200);
  return parseFlightResult(response);
}

export async function messagingSnapshot(fixture: AgentMessageFixture) {
  const claimId = fixture.claimIds[0];
  const [messages, audits, alerts] = await Promise.all([
    dbAdmin
      .select()
      .from(claimMessages)
      .where(eq(claimMessages.claimId, claimId))
      .orderBy(claimMessages.id),
    dbAdmin.select().from(auditLog).where(eq(auditLog.entityId, claimId)).orderBy(auditLog.id),
    dbAdmin
      .select()
      .from(notifications)
      .where(inArray(notifications.userId, [fixture.memberId, fixture.agentId, fixture.staffId]))
      .orderBy(notifications.id),
  ]);
  return { messages, audits, alerts };
}

export async function resetReceipts(fixture: AgentMessageFixture): Promise<string[]> {
  await dbAdmin
    .update(claimMessages)
    .set({ readAt: null })
    .where(eq(claimMessages.claimId, fixture.claimIds[0]));
  const { messages } = await messagingSnapshot(fixture);
  return messages
    .filter(row => row.tenantId === fixture.tenantId && row.isInternal === false)
    .map(row => row.id);
}

export async function assertSession(page: Page, info: TestInfo, userId: string): Promise<void> {
  const response = await transportFor(page, info).auth('get-session');
  expect(response.ok).toBe(true);
  expect(response.userId).toBe(userId);
}

export async function assertNoSessions(userId: string): Promise<void> {
  const rows = await dbAdmin
    .select({ id: session.id })
    .from(session)
    .where(eq(session.userId, userId));
  expect(rows).toHaveLength(0);
}

/** Existing fixture owns all identities, links and claims, including cleanup after partial setup. */
export function withMessagingFixture(
  page: Page,
  info: TestInfo,
  run: (fixture: AgentMessageFixture, ids: ActionIds) => Promise<void>
): Promise<void> {
  return withAgentMessageFixture(info.project.name, async fixture => {
    try {
      await run(fixture, await captureActions(page, info, fixture));
    } finally {
      try {
        await page.goto('about:blank');
      } finally {
        const cleanup = [
          () =>
            dbAdmin
              .delete(notifications)
              .where(
                and(
                  eq(notifications.tenantId, fixture.tenantId),
                  inArray(notifications.userId, [
                    fixture.memberId,
                    fixture.agentId,
                    fixture.staffId,
                  ])
                )
              ),
          () => dbAdmin.delete(auditLog).where(inArray(auditLog.entityId, fixture.claimIds)),
        ];
        let failure: unknown;
        await inSequence(cleanup, step =>
          Promise.resolve(step()).catch((error: unknown) => {
            failure ??= error;
          })
        );
        if (failure) throw failure;
      }
    }
  });
}
