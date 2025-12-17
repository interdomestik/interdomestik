import { beforeEach, describe, expect, it } from 'vitest';
import './messages.test.base';
import { mocks, mockSelectChain, resetMocks } from './messages.test.base';
import { getMessagesForClaim } from './messages';

describe('getMessagesForClaim', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should fail if user is not authenticated', async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await getMessagesForClaim('claim-123');

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('should fail if claim is not found', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue(null);

    const result = await getMessagesForClaim('claim-123');

    expect(result).toEqual({ success: false, error: 'Claim not found' });
  });

  it("should fail if member tries to access another user's claim", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'other-user' });

    const result = await getMessagesForClaim('claim-123');

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });

  it('should return messages for claim owner', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mockSelectChain.orderBy.mockReturnValue([]);

    const result = await getMessagesForClaim('claim-123');

    expect(result.success).toBe(true);
  });

  it('should allow admins to access any claim', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'other-user' });
    mockSelectChain.orderBy.mockReturnValue([]);

    const result = await getMessagesForClaim('claim-123');

    expect(result.success).toBe(true);
  });

  it('should allow supervisor to access any claim', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'supervisor-1', role: 'supervisor' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'other-user' });
    mockSelectChain.orderBy.mockReturnValue([]);

    const result = await getMessagesForClaim('claim-123');

    expect(result.success).toBe(true);
  });

  it('should handle database errors gracefully', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockRejectedValue(new Error('DB Error'));

    const result = await getMessagesForClaim('claim-123');

    expect(result).toEqual({ success: false, error: 'Failed to fetch messages' });
  });

  it('should handle null sender info gracefully', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mockSelectChain.orderBy.mockReturnValue([
      {
        id: 'msg-1',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Test',
        isInternal: null,
        readAt: null,
        createdAt: null,
        sender: null,
      },
    ]);

    const result = await getMessagesForClaim('claim-123');

    expect(result.success).toBe(true);
    expect(result.messages?.[0].sender.name).toBe('Unknown');
    expect(result.messages?.[0].sender.role).toBe('member');
    expect(result.messages?.[0].isInternal).toBe(false);
  });

  it('should fallback to member role when user role is undefined', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mockSelectChain.orderBy.mockReturnValue([]);

    const result = await getMessagesForClaim('claim-123');

    expect(result.success).toBe(true);
  });

  it('should handle partial sender info', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mockSelectChain.orderBy.mockReturnValue([
      {
        id: 'msg-1',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Test',
        isInternal: false,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'user-123', name: null, image: null, role: null },
      },
    ]);

    const result = await getMessagesForClaim('claim-123');

    expect(result.success).toBe(true);
    expect(result.messages?.[0].sender.name).toBe('Unknown');
    expect(result.messages?.[0].sender.image).toBe(null);
    expect(result.messages?.[0].sender.role).toBe('member');
  });
});
