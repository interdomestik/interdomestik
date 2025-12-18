import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the environment variable BEFORE any module imports
vi.stubEnv('NOVU_API_KEY', 'test-api-key');

// Mock Novu SDK using vi.hoisted for proper hoisting
const mocks = vi.hoisted(() => ({
  trigger: vi.fn(),
  identify: vi.fn(),
}));

vi.mock('@novu/node', () => ({
  Novu: class MockNovu {
    trigger = mocks.trigger;
    subscribers = {
      identify: mocks.identify,
    };
  },
}));

import {
  notifyClaimAssigned,
  notifyClaimSubmitted,
  notifyNewMessage,
  notifyStatusChanged,
  sendNotification,
} from './notifications';

describe('Notifications Service', () => {
  // Silence expected error logs during failure-path tests
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trigger.mockResolvedValue({
      data: { data: { transactionId: 'txn-123' } },
    });
    mocks.identify.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NOVU_API_KEY', 'test-api-key');
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
      expect(result.transactionId).toBe('txn-123');
      expect(mocks.trigger).toHaveBeenCalledWith('claim_submitted', {
        to: { subscriberId: 'user-123', email: undefined },
        payload: { claimId: 'claim-1', claimTitle: 'Test Claim', category: 'consumer' },
      });
    });

    it('should identify subscriber when email is provided', async () => {
      await sendNotification(
        'user-123',
        'claim_submitted',
        { claimId: 'claim-1' },
        { email: 'test@example.com', firstName: 'John' }
      );

      expect(mocks.identify).toHaveBeenCalledWith('user-123', {
        email: 'test@example.com',
        firstName: 'John',
        lastName: undefined,
        locale: undefined,
      });
    });

    it('should handle errors gracefully', async () => {
      mocks.trigger.mockRejectedValue(new Error('Novu error'));

      const result = await sendNotification('user-123', 'claim_submitted', { claimId: 'claim-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send notification');
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
      expect(mocks.trigger).toHaveBeenCalledWith('claim_submitted', {
        to: { subscriberId: 'user-123', email: 'user@example.com' },
        payload: {
          claimId: 'claim-1',
          claimTitle: 'My Claim',
          category: 'consumer',
        },
      });
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
      expect(mocks.trigger).toHaveBeenCalledWith('claim_assigned', {
        to: { subscriberId: 'agent-1', email: 'agent@example.com' },
        payload: {
          claimId: 'claim-1',
          claimTitle: 'Member Claim',
          agentName: 'Agent Smith',
        },
      });
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
      expect(mocks.trigger).toHaveBeenCalledWith('claim_status_changed', {
        to: { subscriberId: 'user-123', email: 'user@example.com' },
        payload: {
          claimId: 'claim-1',
          claimTitle: 'My Claim',
          oldStatus: 'submitted',
          newStatus: 'verification',
        },
      });
    });
  });

  describe('notifyNewMessage', () => {
    it('should send new message notification', async () => {
      const result = await notifyNewMessage(
        'user-123',
        'user@example.com',
        { id: 'claim-1', title: 'My Claim' },
        'Agent Smith',
        'Hello, I wanted to update you on your claim...'
      );

      expect(result.success).toBe(true);
      expect(mocks.trigger).toHaveBeenCalledWith('new_message', {
        to: { subscriberId: 'user-123', email: 'user@example.com' },
        payload: {
          claimId: 'claim-1',
          claimTitle: 'My Claim',
          senderName: 'Agent Smith',
          messagePreview: 'Hello, I wanted to update you on your claim...',
        },
      });
    });

    it('should truncate long message preview to 100 chars', async () => {
      const longMessage = 'A'.repeat(150);

      await notifyNewMessage(
        'user-123',
        'user@example.com',
        { id: 'claim-1', title: 'My Claim' },
        'Agent Smith',
        longMessage
      );

      expect(mocks.trigger).toHaveBeenCalledWith(
        'new_message',
        expect.objectContaining({
          payload: expect.objectContaining({
            messagePreview: 'A'.repeat(100),
          }),
        })
      );
    });
  });
});
