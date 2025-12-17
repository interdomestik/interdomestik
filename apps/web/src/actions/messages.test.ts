import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock variables must be defined before vi.mock is called
// vi.mock is hoisted, so we use vi.hoisted to define mocks
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbQuery: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
}));

// Mock select chain for complex queries
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnValue([]),
  limit: vi.fn().mockReturnValue([]),
};

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mocks.getSession(),
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  claimMessages: {
    id: 'id',
    claimId: 'claim_id',
    senderId: 'sender_id',
    content: 'content',
    isInternal: 'is_internal',
    readAt: 'read_at',
    createdAt: 'created_at',
  },
  claims: { id: 'id', userId: 'userId' },
  user: { id: 'id', name: 'name', image: 'image', role: 'role' },
  db: {
    select: () => mockSelectChain,
    insert: () => ({ values: mocks.dbInsert }),
    update: () => ({ set: () => ({ where: mocks.dbUpdate }) }),
    query: {
      claims: {
        findFirst: () => mocks.dbQuery(),
      },
    },
  },
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-message-id',
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
}));

// Import after mocks
import { getMessagesForClaim, markMessagesAsRead, sendMessage } from './messages';

describe('Message Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain mocks
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.leftJoin.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.orderBy.mockReturnValue([]);
    mockSelectChain.limit.mockReturnValue([]);
  });

  describe('getMessagesForClaim', () => {
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
      expect(result.messages).toEqual([]);
    });

    it('should allow agents to access any claim', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'agent-1', role: 'agent' } });
      mocks.dbQuery.mockResolvedValue({ id: 'claim-123', userId: 'other-user' });
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
  });

  describe('sendMessage', () => {
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

      expect(mocks.dbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          isInternal: true,
        })
      );
      expect(result.success).toBe(true);
      expect(result.message?.isInternal).toBe(true);
    });
  });

  describe('markMessagesAsRead', () => {
    it('should fail if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null);

      const result = await markMessagesAsRead(['msg-1', 'msg-2']);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('should succeed with empty message list', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });

      const result = await markMessagesAsRead([]);

      expect(result).toEqual({ success: true });
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
    });

    it('should update messages as read', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });
      mocks.dbUpdate.mockResolvedValue(undefined);

      const result = await markMessagesAsRead(['msg-1', 'msg-2']);

      expect(result).toEqual({ success: true });
      expect(mocks.dbUpdate).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors gracefully', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'user-123' } });
      mocks.dbUpdate.mockRejectedValue(new Error('DB Error'));

      const result = await markMessagesAsRead(['msg-1']);

      expect(result).toEqual({ success: false, error: 'Failed to mark messages as read' });
    });
  });

  describe('sendMessage - additional cases', () => {
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
  });

  describe('getMessagesForClaim - additional cases', () => {
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
  });
});
