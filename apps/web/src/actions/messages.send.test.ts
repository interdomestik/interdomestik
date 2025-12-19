import './messages.test.base';
import { beforeEach, describe, expect, it } from 'vitest';
import { sendMessage } from './messages';
import { mocks, mockSelectChain, resetMocks } from './messages.test.base';

describe('sendMessage', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('should fail if user is not authenticated', async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await sendMessage('claim-123', 'Hello');

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('should fail with empty message content', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });

    const result = await sendMessage('claim-123', '   ');

    expect(result).toEqual({ success: false, error: 'Message cannot be empty' });
  });

  it('should fail if claim is not found', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue(null);

    const result = await sendMessage('claim-123', 'Hello');

    expect(result).toEqual({ success: false, error: 'Claim not found' });
  });

  it("should fail if member tries to message on another user's claim", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'other-user' });

    const result = await sendMessage('claim-123', 'Hello');

    expect(result).toEqual({ success: false, error: 'Access denied' });
  });

  it('should fail if member tries to send internal message', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });

    const result = await sendMessage('claim-123', 'Internal note', true);

    expect(result).toEqual({ success: false, error: 'Only agents can send internal messages' });
  });

  it('should insert message successfully for claim owner', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Hello',
        isInternal: false,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'user-123', name: 'Test User', image: null, role: 'member' },
      },
    ]);

    const result = await sendMessage('claim-123', 'Hello');

    expect(mocks.dbInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Hello',
        isInternal: false,
      })
    );
    expect(result.success).toBe(true);
    expect(result.message?.content).toBe('Hello');
  });

  it('should allow agents to send internal messages', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'agent-1', role: 'agent' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'agent-1',
        content: 'Agent note',
        isInternal: true,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'agent-1', name: 'Agent', image: null, role: 'agent' },
      },
    ]);

    const result = await sendMessage('claim-123', 'Agent note', true);

    expect(mocks.dbInsert).toHaveBeenCalledWith(expect.objectContaining({ isInternal: true }));
    expect(result.success).toBe(true);
    expect(result.message?.isInternal).toBe(true);
  });

  it('should allow supervisor to send messages on any claim', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'supervisor-1', role: 'supervisor' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'other-user' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'supervisor-1',
        content: 'Supervisor message',
        isInternal: false,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'supervisor-1', name: 'Supervisor', image: null, role: 'supervisor' },
      },
    ]);

    const result = await sendMessage('claim-123', 'Supervisor message');

    expect(result.success).toBe(true);
  });

  it('should allow admin to send internal messages', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'admin-1',
        content: 'Admin note',
        isInternal: true,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'admin-1', name: 'Admin', image: null, role: 'admin' },
      },
    ]);

    const result = await sendMessage('claim-123', 'Admin note', true);

    expect(result.success).toBe(true);
    expect(result.message?.isInternal).toBe(true);
  });

  it('should handle database errors during message insert', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockRejectedValue(new Error('DB Error'));

    const result = await sendMessage('claim-123', 'Hello');

    expect(result).toEqual({ success: false, error: 'Failed to send message' });
  });

  it('should handle created message with null sender and missing fields', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Hello',
        isInternal: null,
        readAt: null,
        createdAt: null,
        sender: null,
      },
    ]);

    const result = await sendMessage('claim-123', 'Hello');

    expect(result.success).toBe(true);
    expect(result.message?.isInternal).toBe(false);
    expect(result.message?.sender.name).toBe('Unknown');
    expect(result.message?.sender.id).toBe('user-123');
    expect(result.message?.sender.role).toBe('member');
  });

  it('should handle created message with partial sender info', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123', role: 'member' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Hello',
        isInternal: false,
        readAt: null,
        createdAt: null,
        sender: { id: null, name: null, image: null, role: null },
      },
    ]);

    const result = await sendMessage('claim-123', 'Hello');

    expect(result.success).toBe(true);
    expect(result.message?.sender.id).toBe('user-123');
    expect(result.message?.sender.name).toBe('Unknown');
    expect(result.message?.sender.role).toBe('member');
  });

  it('should fallback to member role when sending without role defined', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });
    mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'user-123' });
    mocks.dbInsert.mockResolvedValue(undefined);
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'test-message-id',
        claimId: 'claim-123',
        senderId: 'user-123',
        content: 'Hello',
        isInternal: false,
        readAt: null,
        createdAt: new Date(),
        sender: { id: 'user-123', name: 'User', image: null, role: 'member' },
      },
    ]);

    const result = await sendMessage('claim-123', 'Hello');

    expect(result.success).toBe(true);
  });
});
