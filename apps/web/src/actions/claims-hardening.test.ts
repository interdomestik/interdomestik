// Mock domain components to verify calls
import { describe, expect, it, vi } from 'vitest';
import { updateClaimStatusCore as adminUpdate } from './admin-claims/update-status.core';
import { updateClaimStatusCore as agentUpdate } from './agent-claims/update-status.core';
import { updateClaimStatusCore as staffUpdate } from './staff-claims/update-status.core';

// Mock Dependencies
vi.mock('@interdomestik/domain-claims/admin-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims/agent-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims/staff-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Domain Users Check
vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminSession: vi.fn().mockResolvedValue(true),
}));

// ...

// ...

// Mock Rate Limiter
const mockRateLimit = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

// Mock Notifications/Audit
vi.mock('@/lib/notifications', () => ({ notifyStatusChanged: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));

describe('Claims Action Hardening Verification', () => {
  const baseSession = {
    user: { id: 'user-1', role: 'tenant_admin', tenantId: 't1' },
    excludes: () => false,
  };
  const getFormData = (status: string) => {
    const fd = new FormData();
    fd.append('claimId', 'c1');
    fd.append('status', status);
    fd.append('locale', 'en');
    return fd;
  };

  describe('Admin Update Status', () => {
    it('enforces rate limit', async () => {
      mockRateLimit.mockResolvedValueOnce({ limited: true });
      await expect(
        adminUpdate({
          formData: getFormData('submitted'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          session: baseSession as any,
          requestHeaders: new Headers(),
        })
      ).rejects.toThrow('Too many requests');
    });

    it('validates status via Zod schema (rejects invalid)', async () => {
      mockRateLimit.mockResolvedValueOnce({ limited: false });
      await expect(
        adminUpdate({
          formData: getFormData('invalid-status'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          session: baseSession as any,
          requestHeaders: new Headers(),
        })
      ).rejects.toThrow('Invalid status');
    });
  });

  describe('Agent Update Status', () => {
    it('enforces rate limit', async () => {
      mockRateLimit.mockResolvedValueOnce({ limited: true });
      await expect(
        agentUpdate({
          claimId: 'c1',
          newStatus: 'submitted',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          session: baseSession as any,
          requestHeaders: new Headers(),
        })
      ).rejects.toThrow('Too many requests');
    });
  });

  describe('Staff Update Status', () => {
    it('enforces rate limit', async () => {
      mockRateLimit.mockResolvedValueOnce({ limited: true });
      const result = await staffUpdate({
        claimId: 'c1',
        newStatus: 'submitted',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        session: baseSession as any,
      });
      expect(result).toEqual({ success: false, error: 'Too many requests. Please wait a moment.' });
    });
  });
});
