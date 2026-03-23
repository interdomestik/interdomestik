import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminSession: vi.fn(async () => {
    throw new Error('Unauthorized');
  }),
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
});
