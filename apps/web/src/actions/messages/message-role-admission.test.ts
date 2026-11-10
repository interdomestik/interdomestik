/** Same claim fixtures through all three mounted actions; an in-memory model, not RLS proof. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noNotification, reply } from './public-reply-flow.test-support';
import { ids, reset, session, state } from './public-reply-notification-flow.fixture';
import { getMessagesForClaim, markMessagesAsRead } from '@/actions/messages';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, PERMISSIONS, ROLES } from '@interdomestik/shared-auth';

vi.mock('@interdomestik/shared-auth', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/shared-auth')>();
  return { ...actual, hasPermission: vi.fn(actual.hasPermission) };
});

type Admission = {
  role: string;
  send: boolean;
  read: boolean;
  internal: boolean;
};
const roles: Admission[] = [
  { role: 'member', send: true, read: true, internal: false },
  { role: 'user', send: true, read: true, internal: false },
  { role: 'agent', send: true, read: true, internal: false },
  { role: 'staff', send: true, read: true, internal: true },
  { role: 'branch_manager', send: false, read: true, internal: true },
  { role: 'admin', send: true, read: true, internal: true },
  { role: 'tenant_admin', send: true, read: true, internal: true },
  { role: 'super_admin', send: true, read: true, internal: true },
  { role: 'auditor', send: false, read: false, internal: false },
  { role: 'global_support', send: false, read: true, internal: false },
  { role: 'unknown', send: false, read: false, internal: false },
  { role: 'admin,member', send: false, read: false, internal: false },
];
const messageIds = ['public-message', 'internal-message', 'unspecified-message'];

function seedConversation(): void {
  reset('restricted');
  state.rows.user.find(user => user.id === ids.agent)!.branchId = 'branch-a';
  state.rows.claimMessages = [false, true, null].map((isInternal, index) => ({
    id: messageIds[index],
    tenantId: ids.tenant,
    claimId: ids.claim,
    senderId: ids.staff,
    content: 'Synthetic incoming message',
    isInternal,
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }));
}

function actAs(role: string): void {
  // Read-only actors own the historical claim; staff/admin controls must not rely on ownership.
  const id = ['staff', 'branch_manager', 'admin', 'tenant_admin', 'super_admin'].includes(role)
    ? 'reviewer-a'
    : ids.member;
  state.session = session(role, { id: role === 'agent' ? ids.agent : id });
}

function noWriteEffects(): void {
  noNotification();
  expect(logAuditEvent).not.toHaveBeenCalled();
}

const visibleIds = (row: Admission): string[] => (row.internal ? messageIds : [messageIds[0]]);

describe('explicit messaging role admission', () => {
  beforeEach(seedConversation);

  it('covers every declared role plus legacy and unrecognized role strings', () => {
    expect(roles.map(row => row.role)).toEqual(expect.arrayContaining(Object.values(ROLES)));
  });

  it.each([
    ['send', PERMISSIONS['claims.update'], () => reply()],
    ['get', PERMISSIONS['claims.read'], () => getMessagesForClaim(ids.claim)],
    ['mark-read', PERMISSIONS['claims.update'], () => markMessagesAsRead(messageIds)],
  ] as const)(
    '%s denies staff when the matrix permission is withdrawn',
    async (_operation, permission, run) => {
      actAs('staff');
      const before = structuredClone(state.rows);
      vi.mocked(hasPermission).mockReturnValueOnce(false);
      expect(await run()).toEqual({ success: false, error: 'Access denied' });
      expect(hasPermission).toHaveBeenCalledWith('staff', permission);
      expect(state.rows).toEqual(before);
      noWriteEffects();
    }
  );

  it.each(roles)('$role sends only its admitted audience', async row => {
    actAs(row.role);
    const before = structuredClone(state.rows.claimMessages);
    const result = await reply();
    expect(result.success).toBe(row.send);
    if (!row.send) {
      expect(result).toEqual({ success: false, error: 'Access denied' });
      expect(await reply(ids.claim, true)).toEqual({ success: false, error: 'Access denied' });
      expect(state.rows.claimMessages).toEqual(before);
      noWriteEffects();
      return;
    }
    expect(state.rows.claimMessages).toHaveLength(before.length + 1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const saved = structuredClone(state.rows.claimMessages);
    const auditCount = vi.mocked(logAuditEvent).mock.calls.length;
    const scheduledCount = state.scheduled.length;
    const internalResult = await reply(ids.claim, true);
    expect(internalResult.success).toBe(row.internal);
    if (!row.internal) {
      expect(internalResult).toEqual({
        success: false,
        error: 'Only staff can send internal messages',
      });
      expect(state.rows.claimMessages).toEqual(saved);
      expect(logAuditEvent).toHaveBeenCalledTimes(auditCount);
      expect(state.scheduled).toHaveLength(scheduledCount);
    }
    expect(state.rows.claimMessages).toHaveLength(before.length + (row.internal ? 2 : 1));
  });

  it.each(roles)('$role lists only its admitted audience', async row => {
    actAs(row.role);
    const before = structuredClone(state.rows);
    const result = await getMessagesForClaim(ids.claim);
    expect(result.success).toBe(row.read);
    if (row.read) {
      expect(result.canAcknowledge).toBe(row.send);
      expect(result.messages?.map(message => message.id)).toEqual(visibleIds(row));
    } else {
      expect(result).toEqual({ success: false, error: 'Access denied' });
    }
    expect(state.rows).toEqual(before);
    noWriteEffects();
  });

  it.each(['branch_manager', 'global_support'])(
    '%s reading preserves recipients unread state',
    async role => {
      actAs(role);
      const before = structuredClone(state.rows);
      expect(await getMessagesForClaim(ids.claim)).toMatchObject({ success: true });
      expect(await markMessagesAsRead(messageIds)).toEqual({
        success: false,
        error: 'Access denied',
      });
      expect(state.rows).toEqual(before);
      noWriteEffects();
    }
  );

  it('recomputes capability from the current server session on every history load', async () => {
    actAs('staff');
    const viewerId = state.session!.user.id;
    expect(await getMessagesForClaim(ids.claim)).toMatchObject({ canAcknowledge: true });
    actAs('branch_manager');
    expect(state.session!.user.id).toBe(viewerId);
    expect(await getMessagesForClaim(ids.claim)).toMatchObject({ canAcknowledge: false });
    actAs('staff');
    expect(await getMessagesForClaim(ids.claim)).toMatchObject({ canAcknowledge: true });
    noWriteEffects();
  });

  it.each(['member', 'staff', 'agent'])(
    '%s can clear unread after an observer reads',
    async participant => {
      state.rows.claimMessages[0].senderId = participant === 'staff' ? ids.member : ids.staff;
      actAs('branch_manager');
      expect(await getMessagesForClaim(ids.claim)).toMatchObject({ canAcknowledge: false });
      actAs('global_support');
      expect(await getMessagesForClaim(ids.claim)).toMatchObject({ canAcknowledge: false });
      expect(state.rows.claimMessages.every(message => message.readAt === null)).toBe(true);
      actAs(participant);
      expect(await getMessagesForClaim(ids.claim)).toMatchObject({ canAcknowledge: true });
      expect(await markMessagesAsRead([messageIds[0]])).toEqual({ success: true });
      expect(state.rows.claimMessages[0].readAt).toBeInstanceOf(Date);
      noWriteEffects();
    }
  );

  it.each(roles)('$role marks only as an admitted participant', async row => {
    actAs(row.role);
    const before = structuredClone(state.rows);
    const result = await markMessagesAsRead(messageIds);
    if (!row.send) expect(state.rows).toEqual(before);
    expect(result).toEqual(
      row.send ? { success: true } : { success: false, error: 'Access denied' }
    );
    expect(
      state.rows.claimMessages.filter(message => message.readAt !== null).map(m => m.id)
    ).toEqual(row.send ? visibleIds(row) : []);
    noWriteEffects();
  });

  it.each([null, undefined, ''])('retains the pinned member fallback for role %s', async role => {
    state.session = session('member', { role });
    expect((await getMessagesForClaim(ids.claim)).messages?.map(message => message.id)).toEqual([
      messageIds[0],
    ]);
    expect(await markMessagesAsRead(messageIds)).toEqual({ success: true });
    expect(
      state.rows.claimMessages.filter(message => message.readAt !== null).map(m => m.id)
    ).toEqual([messageIds[0]]);
    expect(await reply()).toMatchObject({ success: true });
    expect(await reply(ids.claim, true)).toEqual({
      success: false,
      error: 'Only staff can send internal messages',
    });
    noNotification();
  });

  it.each([
    ['member', 'other-tenant'],
    ['super_admin', 'other-tenant'],
    ['member', 'other-owner'],
    ['user', 'other-owner'],
    ['global_support', 'other-owner'],
    ['agent', 'inactive'],
    ['agent', 'unlinked'],
    ['agent', 'other-branch'],
    ['staff', 'other-branch'],
    ['branch_manager', 'other-branch'],
    ['branch_manager', 'missing-branch'],
  ])('denies %s outside %s scope without writes or effects', async (role, scope) => {
    actAs(role);
    if (scope === 'other-tenant') state.session = session(role, { tenantId: ids.otherTenant });
    if (scope === 'other-owner') state.rows.claims[0].userId = 'another-member';
    if (scope === 'inactive') state.rows.agentClients[0].status = 'inactive';
    if (scope === 'unlinked') state.rows.agentClients = [];
    if (scope === 'other-branch') state.rows.claims[0].branchId = 'branch-b';
    if (scope === 'missing-branch') state.session = session(role, { branchId: null });
    const before = structuredClone(state.rows);
    expect(await reply()).toMatchObject({ success: false });
    expect(await getMessagesForClaim(ids.claim)).toMatchObject({ success: false });
    // An admitted role's bulk mark remains a successful no-op for inaccessible IDs.
    const participant = roles.find(row => row.role === role)!.send;
    expect(await markMessagesAsRead(messageIds)).toEqual(
      participant ? { success: true } : { success: false, error: 'Access denied' }
    );
    expect(state.rows).toEqual(before);
    noWriteEffects();
  });
});
