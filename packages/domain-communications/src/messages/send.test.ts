import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agentAccess: vi.fn(),
  tx: {
    insert: vi.fn(),
    query: {
      claims: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
    },
    select: vi.fn(),
  },
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  claimMessages: {
    claimId: 'cm.claim_id',
    content: 'cm.content',
    createdAt: 'cm.created_at',
    id: 'cm.id',
    isInternal: 'cm.is_internal',
    readAt: 'cm.read_at',
    senderId: 'cm.sender_id',
    tenantId: 'cm.tenant_id',
  },
  user: { id: 'u.id', image: 'u.image', name: 'u.name', role: 'u.role' },
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('./access', async importOriginal => ({
  ...(await importOriginal<typeof import('./access')>()),
  hasAgentClaimAccess: mocks.agentAccess,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'message-1' }));

import { sendMessageDbCore } from './send';
import { keyedMessageId, MESSAGE_KEY_CONFLICT_ERROR } from './store-message';

const authority = mintTestTenantAuthority('tenant-1');
const projectionFrom = () => ({
  leftJoin: () => ({
    where: () => ({
      limit: () =>
        Promise.resolve([
          {
            id: 'message-1',
            claimId: 'claim-1',
            senderId: 'staff-1',
            content: 'Hello',
            isInternal: false,
            readAt: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            sender: { id: 'staff-1', name: 'Staff', image: null, role: 'admin' },
          },
        ]),
    }),
  }),
});
const staffSession = { user: { id: 'staff-1', role: 'admin', tenantId: 'tenant-1' } };

describe('sendMessageDbCore authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      async (_authority: unknown, action: (tx: unknown) => unknown) => action(mocks.tx)
    );
    mocks.tx.query.claims.findFirst.mockResolvedValue({
      id: 'claim-1',
      title: 'Claim',
      userId: 'member-1',
    });
    mocks.tx.query.user.findFirst.mockResolvedValue({ email: 'member@example.com' });
    mocks.tx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mocks.tx.select.mockReturnValue({ from: projectionFrom });
  });

  it('rejects a send that holds no authority without opening a tenant transaction', async () => {
    const result = await sendMessageDbCore({
      session: staffSession,
      authority: null,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('writes under the supplied authority and audits with the same authority', async () => {
    const logAuditEvent = vi.fn();

    const result = await sendMessageDbCore({
      session: staffSession,
      authority,
      requestHeaders: new Headers(),
      claimId: 'claim-1',
      content: 'Hello',
      deps: { logAuditEvent },
    });

    expect(result).toMatchObject({
      success: true,
      claim: { id: 'claim-1', tenantId: 'tenant-1' },
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ action: 'claim.message_sent' });
    expect(logAuditEvent.mock.calls[0]?.[0].authority).toBe(authority);
  });

  describe('with a client message key', () => {
    const clientMessageId = '7f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7';
    const stored = { senderId: 'staff-1', claimId: 'claim-1', content: 'Hello', isInternal: false };
    const returning = vi.fn();
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const insertValues = vi.fn(() => ({ onConflictDoNothing }));
    const lookup = vi.fn();

    beforeEach(() => {
      mocks.tx.insert.mockReturnValue({ values: insertValues });
      // The replay lookup filters claim_messages directly; the projection joins the sender.
      mocks.tx.select.mockReturnValue({
        from: () => ({ ...projectionFrom(), where: () => ({ limit: lookup }) }),
      });
    });

    const keyedSend = (content: string, logAuditEvent = vi.fn()) =>
      sendMessageDbCore({
        session: staffSession,
        authority,
        requestHeaders: new Headers(),
        claimId: 'claim-1',
        content,
        clientMessageId,
        deps: { logAuditEvent },
      });

    it('derives the row id from tenant, sender and key', () => {
      const id = keyedMessageId('tenant-1', 'staff-1', clientMessageId);
      expect(id).toMatch(/^msg_[\w-]{43}$/);
      expect(keyedMessageId('tenant-1', 'staff-1', clientMessageId)).toBe(id);
      expect(keyedMessageId('tenant-1', 'member-1', clientMessageId)).not.toBe(id);
      expect(keyedMessageId('tenant-2', 'staff-1', clientMessageId)).not.toBe(id);
    });

    it('stores the first send once under its derived primary key', async () => {
      returning.mockResolvedValue([{ id: 'message-1' }]);
      const logAuditEvent = vi.fn();

      const result = await keyedSend('Hello', logAuditEvent);

      expect(result).toMatchObject({
        success: true,
        replayed: false,
        message: { id: 'message-1' },
      });
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: keyedMessageId('tenant-1', 'staff-1', clientMessageId),
          tenantId: 'tenant-1',
          senderId: 'staff-1',
        })
      );
      expect(onConflictDoNothing).toHaveBeenCalledWith({ target: 'cm.id' });
      expect(lookup).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledTimes(1);
    });

    it('replays the stored message for a resent key without auditing it again', async () => {
      returning.mockResolvedValue([]);
      lookup.mockResolvedValue([stored]);
      const logAuditEvent = vi.fn();

      const result = await keyedSend('  Hello  ', logAuditEvent);

      expect(result).toMatchObject({ success: true, replayed: true, message: { id: 'message-1' } });
      expect(logAuditEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['different content', [{ ...stored, content: 'Something else' }]],
      ['different audience', [{ ...stored, isInternal: true }]],
      ['an unreadable row', []],
    ])('fails closed when a resent key meets %s', async (_case, rows) => {
      returning.mockResolvedValue([]);
      lookup.mockResolvedValue(rows);
      const logAuditEvent = vi.fn();

      const result = await keyedSend('Hello', logAuditEvent);

      expect(result).toEqual({ success: false, error: MESSAGE_KEY_CONFLICT_ERROR });
      expect(logAuditEvent).not.toHaveBeenCalled();
    });

    it('rejects a malformed key before opening a tenant transaction', async () => {
      const result = await sendMessageDbCore({
        session: staffSession,
        authority,
        requestHeaders: new Headers(),
        claimId: 'claim-1',
        content: 'Hello',
        clientMessageId: 'bad key!',
      });

      expect(result).toEqual({ success: false, error: 'Invalid message key' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
    });
  });
});
