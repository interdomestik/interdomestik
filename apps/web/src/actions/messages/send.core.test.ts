import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),

  claimsFindFirst: vi.fn(),
  userFindFirst: vi.fn(),

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

vi.mock('@interdomestik/database', () => ({
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
  db: {
    query: {
      claims: { findFirst: mocks.claimsFindFirst },
      user: { findFirst: mocks.userFindFirst },
    },
    insert: () => ({ values: mocks.insertValues }),
    select: mocks.select,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ __eq: true })),
  and: vi.fn(() => ({ __and: true })),
}));

import type { Session } from './context';
import { sendMessageDbCore } from './send.core';

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
    mocks.selectFrom.mockReturnValue({ leftJoin: mocks.selectLeftJoin });
    mocks.select.mockReturnValue({ from: mocks.selectFrom });
  });

  it('returns Unauthorized when session missing', async () => {
    const result = await sendMessageDbCore({
      session: null,
      requestHeaders: new Headers(),
      claimId: 'claim_1',
      content: 'Hello',
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.claimsFindFirst).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('returns Message cannot be empty for whitespace-only content', async () => {
    const result = await sendMessageDbCore({
      session: {
        user: { id: 'user_1', role: 'user', name: 'U', tenantId: 'tenant_mk' },
      } as NonNullable<Session>,
      requestHeaders: new Headers(),
      claimId: 'claim_1',
      content: '   ',
    });

    expect(result).toEqual({ success: false, error: 'Message cannot be empty' });
    expect(mocks.claimsFindFirst).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('inserts message + returns normalized message (staff external message)', async () => {
    mocks.claimsFindFirst.mockResolvedValue({
      id: 'claim_1',
      userId: 'member_1',
      title: 'My Claim',
    });
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.userFindFirst.mockResolvedValue({ email: 'member@example.com' });

    const result = await sendMessageDbCore({
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
      expect(result.claim).toEqual({ id: 'claim_1', title: 'My Claim', userId: 'member_1' });
      expect(result.claimOwnerEmail).toBe('member@example.com');
    }

    expect(mocks.claimsFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.userFindFirst).toHaveBeenCalledTimes(1);
  });
});
