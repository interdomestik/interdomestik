import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUpdateSettingsCore } from './update.core';

vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminSession: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

describe('adminUpdateSettingsCore', () => {
  const mockSession = {
    session: {
      id: 'sess1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'admin1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'token1',
    },
    user: { id: 'admin1', tenantId: 't1', role: 'admin' },
  };
  const validData = {
    appName: 'TestApp',
    supportEmail: 'support@example.com',
    autoAssign: true,
    defaultExpiry: 30,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail validation with bad data', async () => {
    const result = await adminUpdateSettingsCore({
      session: mockSession as any,
      data: { appName: '' }, // missing fields, name too short
    });
    expect(result).toEqual({ success: false, error: 'Validation failed' });
  });

  it('should fail if rate limited', async () => {
    (enforceRateLimitForAction as any).mockResolvedValue({ limited: true });

    const result = await adminUpdateSettingsCore({
      session: mockSession as any,
      data: validData,
    });

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain('Too many requests');
    }
  });

  it('should update successfully', async () => {
    (enforceRateLimitForAction as any).mockResolvedValue({ limited: false });

    const result = await adminUpdateSettingsCore({
      session: mockSession as any,
      data: validData,
    });

    expect(result.success).toBe(true);
    expect(logAuditEvent).toHaveBeenCalled();
  });
});
