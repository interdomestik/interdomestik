import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),

  claimsLock: vi.fn(),
  lockRecipient: vi.fn(),
  enqueueNotification: vi.fn(),

  insertValues: vi.fn(),

  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectLeftJoin: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));
vi.mock('./claim-effects', () => ({
  claimMessageEffects: { answerClaimResponseRequests: vi.fn() },
}));
vi.mock(
  '../../../../../packages/domain-communications/src/notification-deliveries/claim-owner',
  () => ({
    lockClaimNotificationRecipient: mocks.lockRecipient,
    enqueueClaimMessageNotification: mocks.enqueueNotification,
  })
);
vi.mock('../../../../../packages/domain-communications/src/notification-deliveries/staff', () => ({
  resolveStaffClaimNotificationRecipients: vi.fn(),
  enqueueStaffClaimNotification: vi.fn(),
}));

vi.mock('@interdomestik/database', () => {
  const database = {
    insert: () => ({ values: mocks.insertValues }),
    select: mocks.select,
  };
  return {
    claimMessages: {
      id: 'claimMessages.id',
      claimId: 'claimMessages.claimId',
      senderId: 'claimMessages.senderId',
      content: 'claimMessages.content',
      isInternal: 'claimMessages.isInternal',
      readAt: 'claimMessages.readAt',
      createdAt: 'claimMessages.createdAt',
    },
    claims: {
      id: 'claims.id',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      image: 'user.image',
      role: 'user.role',
    },
    db: database,
    withTenantContext: (_context: unknown, action: (tx: typeof database) => unknown) =>
      action(database),
  };
});

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ __eq: true })),
  and: vi.fn(() => ({ __and: true })),
}));

import type { Session } from './context';
import { sendMessageDbCore } from './send.core';

const authority = mintTestTenantAuthority('tenant_mk');

describe('sendMessageDbCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.selectLimit.mockResolvedValue([
      {
        id: 'msg_1',
        claimId: 'claim_1',
        senderId: 'user_1',
        content: 'Hello',
        isInternal: false,
        readAt: null,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        sender: {
          id: 'user_1',
          name: 'Agent',
          image: null,
          role: 'staff',
        },
      },
    ]);

    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectLeftJoin.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectFrom.mockImplementation(table =>
      table.id === 'claims.id'
        ? { where: () => ({ for: mocks.claimsLock }) }
        : { leftJoin: mocks.selectLeftJoin }
    );
    mocks.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.lockRecipient.mockResolvedValue({ id: 'member_1', role: 'member', emailVerified: true });
    mocks.enqueueNotification.mockResolvedValue(['delivery-1']);
  });

  it('returns Unauthorized when session missing', async () => {
    const result = await sendMessageDbCore({
      authority: null,
      session: null,
      requestHeaders: new Headers(),
      claimId: 'claim_1',
      content: 'Hello',
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.claimsLock).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('returns Message cannot be empty for whitespace-only content', async () => {
    const result = await sendMessageDbCore({
      authority,
      session: {
        user: { id: 'user_1', role: 'user', name: 'U', tenantId: 'tenant_mk' },
      } as NonNullable<Session>,
      requestHeaders: new Headers(),
      claimId: 'claim_1',
      content: '   ',
    });

    expect(result).toEqual({ success: false, error: 'Message cannot be empty' });
    expect(mocks.claimsLock).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('inserts message + returns normalized message (staff external message)', async () => {
    mocks.claimsLock.mockResolvedValue([
      {
        id: 'claim_1',
        userId: 'member_1',
        title: 'My Claim',
        caseLifecycleState: 'submitted',
      },
    ]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.logAuditEvent.mockResolvedValue(undefined);

    const result = await sendMessageDbCore({
      authority,
      session: {
        user: { id: 'user_1', role: 'staff', name: 'Agent', tenantId: 'tenant_mk' },
      } as NonNullable<Session>,
      requestHeaders: new Headers(),
      claimId: 'claim_1',
      content: 'Hello',
      isInternal: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toEqual(
        expect.objectContaining({
          id: 'msg_1',
          claimId: 'claim_1',
          senderId: 'user_1',
          content: 'Hello',
          isInternal: false,
          sender: expect.objectContaining({ id: 'user_1', role: 'staff' }),
        })
      );
      expect(result.isStaff).toBe(true);
      expect(result.isInternal).toBe(false);
      expect(result.claim).toEqual({
        id: 'claim_1',
        title: 'My Claim',
        tenantId: 'tenant_mk',
        userId: 'member_1',
      });
      expect(result.deliveryIds).toEqual(['delivery-1']);
    }

    expect(mocks.claimsLock).toHaveBeenCalledExactlyOnceWith('no key update');
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.lockRecipient).toHaveBeenCalledTimes(1);
  });

  it('returns the committed message when the post-commit audit logger rejects', async () => {
    mocks.claimsLock.mockResolvedValue([
      {
        id: 'claim_1',
        userId: 'member_1',
        title: 'My Claim',
        caseLifecycleState: 'submitted',
      },
    ]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.logAuditEvent.mockRejectedValueOnce(new Error('private SQL details'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await sendMessageDbCore({
        authority,
        session: {
          user: { id: 'user_1', role: 'staff', tenantId: 'tenant_mk' },
        } as NonNullable<Session>,
        requestHeaders: new Headers(),
        claimId: 'claim_1',
        content: 'Hello',
      });
      expect(result).toMatchObject({ success: true, message: { id: 'msg_1' } });
      expect(mocks.insertValues).toHaveBeenCalledOnce();
      expect(mocks.logAuditEvent).toHaveBeenCalledOnce();
      expect(errorLog).toHaveBeenCalledWith('Message audit failed after commit', expect.any(Error));
    } finally {
      errorLog.mockRestore();
    }
  });

  it.each([
    {
      name: 'denies staff messages for claims outside their scoped branch',
      claimBranchId: 'branch-b',
      user: { id: 'staff-1', role: 'staff', name: 'Agent' },
    },
    {
      name: 'denies branch manager messages even for in-branch claims',
      claimBranchId: 'branch-a',
      user: { id: 'manager-1', role: 'branch_manager', name: 'Branch manager' },
    },
  ])('$name', async ({ claimBranchId, user }) => {
    mocks.claimsLock.mockResolvedValue([
      {
        id: 'claim_1',
        userId: 'member_1',
        title: 'My Claim',
        branchId: claimBranchId,
        staffId: 'staff-2',
      },
    ]);

    const result = await sendMessageDbCore({
      authority,
      session: {
        user: {
          ...user,
          tenantId: 'tenant_mk',
          branchId: 'branch-a',
        },
      } as NonNullable<Session>,
      requestHeaders: new Headers(),
      claimId: 'claim_1',
      content: 'Hello',
      isInternal: false,
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
