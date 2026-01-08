import { describe, expect, it, vi } from 'vitest';
import { getUsers, updateUserAgent } from './admin-users.core';

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: vi.fn(() => Promise.resolve({ limited: false })),
}));

vi.mock('./admin-users/context', () => ({
  getActionContext: vi.fn(() =>
    Promise.resolve({ session: { user: { id: 'admin' } }, requestHeaders: new Headers() })
  ),
}));

vi.mock('./admin-users/update-user-agent', () => ({
  updateUserAgentCore: vi.fn(),
}));

vi.mock('./admin-users/get-users', () => ({
  getUsersCore: vi.fn(),
}));

describe('Admin User Actions', () => {
  describe('updateUserAgent', () => {
    it('returns validation error for invalid input', async () => {
      const result = await updateUserAgent('', null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Validation failed');
      }
    });

    it('returns success when core function succeeds', async () => {
      const { updateUserAgentCore } = await import('./admin-users/update-user-agent');
      vi.mocked(updateUserAgentCore).mockResolvedValue({ id: 'user', agentId: null } as any);

      const result = await updateUserAgent('user-1', null);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });

    it('returns error when core function fails', async () => {
      const { updateUserAgentCore } = await import('./admin-users/update-user-agent');
      vi.mocked(updateUserAgentCore).mockResolvedValue({ error: 'Database error' } as any);

      const result = await updateUserAgent('user-1', 'agent-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database error');
      }
    });
  });

  describe('getUsers', () => {
    it('returns empty list wrapped in ActionResult on success', async () => {
      const { getUsersCore } = await import('./admin-users/get-users');
      vi.mocked(getUsersCore).mockResolvedValue([]);

      const result = await getUsers();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('handles unexpected errors gracefully', async () => {
      const { getUsersCore } = await import('./admin-users/get-users');
      vi.mocked(getUsersCore).mockRejectedValue(new Error('Kaboom'));

      const result = await getUsers();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to retrieve users');
      }
    });
  });
});
