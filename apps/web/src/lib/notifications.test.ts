import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the environment variable
vi.stubEnv('NOVU_API_KEY', 'test-api-key');

vi.mock('@/lib/notifications/recipient-role', () => ({
  getNotificationRecipientRole: vi.fn(() => Promise.resolve('member')),
}));

vi.mock('next/server', () => ({ after: vi.fn() }));

// Mock dependencies
vi.mock('@interdomestik/database', () => {
  const db = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue({}),
      }),
    }),
    query: {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          email: 'verified@example.com',
          emailVerified: true,
          tenantId: 'tenant_mk',
        }),
      },
    },
  };
  return {
    db,
    withTenantContext: (_context: unknown, callback: (tx: unknown) => unknown) =>
      Promise.resolve().then(() => callback(db)),
  };
});

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
  notifySupportHandoffPublicResponse,
  notifyStatusChanged,
  sendNotification,
} from './notifications';

const authorityMk = mintTestTenantAuthority('tenant_mk');
const authorityKs = mintTestTenantAuthority('tenant_ks');

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
      const result = await sendNotification(
        'user-123',
        'claim_submitted',
        {
          claimId: 'claim-1',
          claimTitle: 'Test Claim',
          category: 'consumer',
        },
        { authority: authorityMk }
      );

      expect(result.success).toBe(true);
    });

    it('rejects a recipient outside the requested tenant', async () => {
      const result = await sendNotification(
        'user-123',
        'claim_submitted',
        { claimId: 'claim-1' },
        { authority: authorityKs }
      );

      expect(result).toEqual({ success: false, error: 'Tenant mismatch for notification' });
    });

    it('should handle errors gracefully', async () => {
      // Mock db to throw error
      const { db } = await import('@interdomestik/database');
      vi.mocked(db.insert).mockImplementationOnce(() => {
        throw new Error('DB Error');
      });

      const result = await sendNotification(
        'user-123',
        'claim_submitted',
        { claimId: 'claim-1' },
        { authority: authorityMk }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('notifyClaimSubmitted', () => {
    it('should send claim submitted notification', async () => {
      const result = await notifyClaimSubmitted(
        'user-123',
        'user@example.com',
        {
          id: 'claim-1',
          title: 'My Claim',
          category: 'consumer',
        },
        { authority: authorityMk }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('notifyClaimAssigned', () => {
    it('should send claim assigned notification to agent', async () => {
      const result = await notifyClaimAssigned(
        'agent-1',
        'agent@example.com',
        { id: 'claim-1', title: 'Member Claim' },
        'Agent Smith',
        { authority: authorityMk }
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
        'verification',
        { authority: authorityMk }
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
        'Hello...',
        { authority: authorityMk }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('notifySupportHandoffPublicResponse', () => {
    it('should send an in-app support handoff public response notification', async () => {
      const result = await notifySupportHandoffPublicResponse(
        'member-1',
        { id: 'handoff-1', publicResponseVersion: 2 },
        { authority: authorityMk }
      );

      expect(result.success).toBe(true);
    });
  });
});
