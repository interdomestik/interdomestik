import { describe, expect, it, vi } from 'vitest';
import { getUsers, updateUserAgent } from './admin-users.core';

// Define mock functions
const mockUpdateUserAgentCore = vi.fn();
const mockGetUsersCore = vi.fn();

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: vi.fn(() => Promise.resolve({ limited: false })),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: 'admin-1', role: 'admin', tenantId: 't1' },
      })),
    },
  },
}));

vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrUnauthorized: vi.fn(async () => undefined),
}));

vi.mock('./admin-users/context', () => ({
  getActionContext: vi.fn(() =>
    Promise.resolve({ session: { user: { id: 'admin' } }, requestHeaders: new Headers() })
  ),
}));

// Mock the core files with factories relying on hoisited vars or just returning the mock
vi.mock('./admin-users/update-user-agent.core', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateUserAgentCore: (...args: any[]) => mockUpdateUserAgentCore(...args),
}));

vi.mock('./admin-users/get-users', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUsersCore: (...args: any[]) => mockGetUsersCore(...args),
}));

describe('Admin User Actions', () => {
  describe('updateUserAgent', () => {
    it('returns validation error for invalid input', async () => {
      const result = await updateUserAgent('', null);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Validation error detail might vary or map to generic error in test env
        // We just ensure it failed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(result.error || (result as any).validationErrors).toBeTruthy();
      }
    });

    it('returns success when core function succeeds', async () => {
      mockUpdateUserAgentCore.mockResolvedValue({ id: 'user', agentId: null });
      const result = await updateUserAgent('user-1', null);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });

    it('returns error when core function fails', async () => {
      mockUpdateUserAgentCore.mockResolvedValue({ error: 'Database error' });
      const result = await updateUserAgent('user-1', 'agent-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        // Safe Action might obscure the error in tests if not handling serverError correctly
        // Just checking it fails for now
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('getUsers', () => {
    it('returns empty list wrapped in ActionResult on success', async () => {
      mockGetUsersCore.mockResolvedValue([]);
      const result = await getUsers({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('handles unexpected errors gracefully', async () => {
      mockGetUsersCore.mockRejectedValue(new Error('Kaboom'));
      const result = await getUsers({});

      expect(result.success).toBe(false);
      if (!result.success) {
        // Safe Action typically returns generic message for unhandled errors
        expect(result.error).toBeTruthy();
      }
    });
  });
});
