import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { Session } from './context';
import { adminUpdateSettingsCore } from './update';

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: vi.fn() }));

const data = {
  appName: 'Interdomestik',
  supportEmail: 'support@example.com',
  autoAssign: true,
  defaultExpiry: 30,
};

describe('platform settings authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enforceRateLimitForAction).mockResolvedValue({ limited: false });
  });

  it.each(['tenant_admin', 'admin', 'branch_manager', 'staff', 'agent', 'member', 'unknown'])(
    'refuses direct action calls by %s before validation or side effects',
    async role => {
      const session = { user: { id: 'u1', tenantId: 't1', role } } as NonNullable<Session>;
      await expect(adminUpdateSettingsCore({ session, data })).rejects.toThrow('Unauthorized');
      expect(enforceRateLimitForAction).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
    }
  );

  it('refuses an unauthenticated caller', async () => {
    await expect(adminUpdateSettingsCore({ session: null, data })).rejects.toThrow('Unauthorized');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('admits only the authenticated super_admin primary role', async () => {
    const session = { user: { id: 'u1', role: 'super_admin' } } as NonNullable<Session>;
    await expect(adminUpdateSettingsCore({ session, data })).resolves.toEqual({ success: true });
    expect(enforceRateLimitForAction).toHaveBeenCalledOnce();
  });
});
