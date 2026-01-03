import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the environment variable
vi.stubEnv('NOVU_API_KEY', 'test-api-key');

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    query: {
      user: {
        findFirst: vi.fn().mockResolvedValue({ tenantId: 'tenant_mk' }),
      },
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendClaimAssignedEmail: vi.fn().mockResolvedValue({}),
  sendClaimSubmittedEmail: vi.fn().mockResolvedValue({}),
  sendNewMessageEmail: vi.fn().mockResolvedValue({}),
  sendStatusChangedEmail: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue({ success: true, okCount: 1, failCount: 0 }),
}));

import {
  notifyClaimAssigned,
  notifyClaimSubmitted,
  notifyNewMessage,
  notifyStatusChanged,
  sendNotification,
} from './notifications';

describe('Notifications Service', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('sendNotification', () => {
    it('should send a notification successfully', async () => {
      const result = await sendNotification('user-123', 'claim_submitted', {
        claimId: 'claim-1',
        claimTitle: 'Test Claim',
        category: 'consumer',
      });

      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Mock db to throw error
      const { db } = await import('@interdomestik/database');
      vi.mocked(db.insert).mockImplementationOnce(() => {
        throw new Error('DB Error');
      });

      const result = await sendNotification('user-123', 'claim_submitted', { claimId: 'claim-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('notifyClaimSubmitted', () => {
    it('should send claim submitted notification', async () => {
      const result = await notifyClaimSubmitted('user-123', 'user@example.com', {
        id: 'claim-1',
        title: 'My Claim',
        category: 'consumer',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('notifyClaimAssigned', () => {
    it('should send claim assigned notification to agent', async () => {
      const result = await notifyClaimAssigned(
        'agent-1',
        'agent@example.com',
        { id: 'claim-1', title: 'Member Claim' },
        'Agent Smith'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('notifyStatusChanged', () => {
    it('should send status change notification', async () => {
      const result = await notifyStatusChanged(
        'user-123',
        'user@example.com',
        { id: 'claim-1', title: 'My Claim' },
        'submitted',
        'verification'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('notifyNewMessage', () => {
    it('should send new message notification', async () => {
      const result = await notifyNewMessage(
        'user-123',
        'user@example.com',
        { id: 'claim-1', title: 'My Claim' },
        'Agent Smith',
        'Hello...'
      );

      expect(result.success).toBe(true);
    });
  });
});
