import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminSession: vi.fn(async () => {
    throw new Error('Unauthorized');
  }),
}));

vi.mock('@interdomestik/domain-referrals/member-referrals/settings', () => ({
  getMemberReferralProgramSettingsCore: vi.fn(),
  upsertMemberReferralProgramSettingsCore: vi.fn(),
}));

import type { Session } from './member-referrals/context';
import {
  getMemberReferralProgramSettingsCore,
  updateMemberReferralProgramSettingsCore,
} from './member-referrals/settings.core';

describe('member-referrals settings core', () => {
  it('throws Unauthorized when non-admin reads referral settings', async () => {
    await expect(
      getMemberReferralProgramSettingsCore({
        session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('throws Unauthorized when non-admin updates referral settings', async () => {
    await expect(
      updateMemberReferralProgramSettingsCore({
        session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
        requestHeaders: new Headers(),
        data: { enabled: true },
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('rejects renewal as a qualifying event for referral settings updates', async () => {
    const { requireTenantAdminSession } = await import('@interdomestik/domain-users/admin/access');
    vi.mocked(requireTenantAdminSession).mockResolvedValueOnce(undefined as never);

    const result = await updateMemberReferralProgramSettingsCore({
      session: {
        user: { id: 'u1', role: 'admin', tenantId: 'tenant-1' },
      } as unknown as NonNullable<Session>,
      requestHeaders: new Headers(),
      data: { qualifyingEventType: 'renewal' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Validation failed');
    }
  });
});
