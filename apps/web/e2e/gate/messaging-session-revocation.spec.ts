import { agentClients, claims, dbAdmin, E2E_USERS, user } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import type { AgentMessageFixture } from './agent-message-visibility.fixture';
import {
  assertNoSessions,
  assertSession,
  authPost,
  callMessaging,
  loginFixture,
  messagingSnapshot,
  resetReceipts,
  transportFor,
  withMessagingFixture,
  type ActionIds,
} from './messaging-session-revocation.fixture';

// Cookies are retained in memory only, including on failure. Never attach browser/API traces.
test.use({ storageState: { cookies: [], origins: [] }, trace: 'off' });
test.setTimeout(180_000);

async function expectAdmitted(
  page: Page,
  info: TestInfo,
  fixture: AgentMessageFixture,
  ids: ActionIds,
  actorId: string
): Promise<void> {
  const messageIds = await resetReceipts(fixture);
  const read = await callMessaging(page, info, ids, 'history', fixture, messageIds);
  expect(read).toMatchObject({ success: true, canAcknowledge: true });
  expect(read.messages).toEqual(
    expect.arrayContaining([expect.objectContaining({ content: 'S1 public incoming' })])
  );
  const before = await messagingSnapshot(fixture);
  expect((await callMessaging(page, info, ids, 'send', fixture, messageIds)).success).toBe(true);
  const beforeReceipt = await messagingSnapshot(fixture);
  const eligible = beforeReceipt.messages.find(
    row =>
      messageIds.includes(row.id) &&
      row.tenantId === fixture.tenantId &&
      row.senderId !== actorId &&
      row.isInternal === false &&
      row.readAt === null
  );
  expect(
    eligible?.readAt,
    'an eligible recipient row is unread immediately before receipt'
  ).toBeNull();
  expect((await callMessaging(page, info, ids, 'receipt', fixture, messageIds)).success).toBe(true);
  const after = await messagingSnapshot(fixture);
  expect(after.messages.find(row => row.id === eligible?.id)?.readAt).toBeInstanceOf(Date);
  expect(after.messages).toHaveLength(before.messages.length + 1);
  expect(after.audits).toHaveLength(before.audits.length + 1);
  expect(after.messages.some(row => messageIds.includes(row.id) && row.readAt !== null)).toBe(true);
}

async function expectScopeDenied(
  page: Page,
  info: TestInfo,
  fixture: AgentMessageFixture,
  ids: ActionIds
): Promise<void> {
  const messageIds = await resetReceipts(fixture);
  const before = await messagingSnapshot(fixture);
  const history = await callMessaging(page, info, ids, 'history', fixture, messageIds);
  expect(history).toMatchObject({ success: false, error: 'Access denied' });
  expect(history.messages).toBeUndefined();
  const send = await callMessaging(page, info, ids, 'send', fixture, messageIds);
  expect(send.success).toBe(false);
  expect(send.error).toMatch(/^Access denied/);
  // Bulk receipts skip out-of-scope rows in the UPDATE predicate and report success, so the
  // response never reveals which message ids exist. The zero-write snapshot is the denial proof.
  const receipt = await callMessaging(page, info, ids, 'receipt', fixture, messageIds);
  expect(receipt.success).toBe(true);
  expect(await messagingSnapshot(fixture)).toEqual(before);
}

test('revoked cookie cannot read, send or acknowledge messages and causes zero writes', async ({
  page,
}, info) => {
  await withMessagingFixture(page, info, async (fixture, ids) => {
    await expectAdmitted(page, info, fixture, ids, fixture.agentId);
    const transport = transportFor(page, info);
    const captured = transport.cookies().filter(cookie => cookie.name.endsWith('session_token'));
    expect(captured.length, 'captured a session cookie without serializing it').toBeGreaterThan(0);
    expect((await authPost(page, info, 'sign-out', {})).ok).toBe(true);
    await assertNoSessions(fixture.agentId);
    const messageIds = await resetReceipts(fixture);
    const before = await messagingSnapshot(fixture);
    // Each operation receives the original cookie even if the previous rejection cleared it.
    const replay = async (operation: 'history' | 'send' | 'receipt') => {
      transport.replaceCookies(captured);
      const result = await callMessaging(page, info, ids, operation, fixture, messageIds);
      expect(result).toMatchObject({ success: false, error: 'Unauthorized' });
      expect(result.messages).toBeUndefined();
      expect(await messagingSnapshot(fixture)).toEqual(before);
    };
    await replay('history');
    await replay('send');
    await replay('receipt');
    await assertNoSessions(fixture.agentId);
  });
});

test('active agent link becomes inactive in the same session and denies messaging without writes', async ({
  page,
}, info) => {
  await withMessagingFixture(page, info, async (fixture, ids) => {
    await expectAdmitted(page, info, fixture, ids, fixture.agentId);
    const changed = await dbAdmin
      .update(agentClients)
      .set({ status: 'inactive' })
      .where(
        and(
          eq(agentClients.tenantId, fixture.tenantId),
          eq(agentClients.agentId, fixture.agentId),
          eq(agentClients.memberId, fixture.memberId)
        )
      )
      .returning({ id: agentClients.id });
    expect(changed).toHaveLength(1);
    await assertSession(page, info, fixture.agentId);
    await expectScopeDenied(page, info, fixture, ids);
  });
});

test('live claim branch change denies scoped staff while its member keeps admission', async ({
  page,
  browser,
}, info) => {
  await withMessagingFixture(page, info, async (fixture, ids) => {
    await dbAdmin
      .update(user)
      .set({ branchId: fixture.branchId })
      .where(eq(user.id, fixture.staffId));
    await loginFixture(page, info, fixture.staffEmail, fixture.staffId);
    await expectAdmitted(page, info, fixture, ids, fixture.staffId);
    const memberContext = await browser.newContext({
      baseURL: info.project.use.baseURL,
      extraHTTPHeaders: info.project.use.extraHTTPHeaders,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const memberPage = await memberContext.newPage();
      await loginFixture(memberPage, info, fixture.memberEmail, fixture.memberId);
      await expectAdmitted(memberPage, info, fixture, ids, fixture.memberId);
      const changed = await dbAdmin
        .update(claims)
        .set({ branchId: null })
        .where(and(eq(claims.id, fixture.claimIds[0]), eq(claims.tenantId, fixture.tenantId)))
        .returning({ id: claims.id });
      expect(changed).toHaveLength(1);
      await assertSession(page, info, fixture.staffId);
      await expectScopeDenied(page, info, fixture, ids);
      await assertSession(memberPage, info, fixture.memberId);
      await expectAdmitted(memberPage, info, fixture, ids, fixture.memberId);
    } finally {
      await memberContext.close();
    }
  });
});

test('real read-only global support session reads owned history but cannot send or acknowledge', async ({
  page,
}, info) => {
  await withMessagingFixture(page, info, async (fixture, ids) => {
    // Historical owner retained after a role change: use the catalogue role, never a new seed.
    await dbAdmin
      .update(user)
      .set({ role: E2E_USERS.GLOBAL_SUPPORT.dbRole })
      .where(eq(user.id, fixture.memberId));
    await loginFixture(page, info, fixture.memberEmail, fixture.memberId);
    const messageIds = await resetReceipts(fixture);
    const before = await messagingSnapshot(fixture);
    const history = await callMessaging(page, info, ids, 'history', fixture, messageIds);
    expect(history).toMatchObject({ success: true, canAcknowledge: false });
    const publicRows = before.messages.filter(
      row => row.tenantId === fixture.tenantId && row.isInternal === false
    );
    expect(history.messages).toHaveLength(publicRows.length);
    expect(history.messages).toEqual(
      expect.arrayContaining(
        publicRows.map(row => expect.objectContaining({ id: row.id, content: row.content }))
      )
    );
    expect(
      before.messages.some(
        row =>
          messageIds.includes(row.id) && row.senderId !== fixture.memberId && row.readAt === null
      )
    ).toBe(true);
    expect(await callMessaging(page, info, ids, 'send', fixture, messageIds)).toMatchObject({
      success: false,
      error: 'Access denied',
    });
    expect(await callMessaging(page, info, ids, 'receipt', fixture, messageIds)).toMatchObject({
      success: false,
      error: 'Access denied',
    });
    expect(await messagingSnapshot(fixture)).toEqual(before);
  });
});
