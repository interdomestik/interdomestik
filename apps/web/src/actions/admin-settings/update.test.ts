import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/domain-users/admin/access', () => {
  return {
    requireTenantAdminSession: vi.fn(async () => {
      throw new Error('Unauthorized');
    }),
  };
});

import type { Session } from './context';
import { adminUpdateSettingsCore } from './update';

describe('actions/admin-settings adminUpdateSettingsCore', () => {
  it('throws Unauthorized when not admin', async () => {
    await expect(
      adminUpdateSettingsCore({
        session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
        data: {
          appName: 'Interdomestik',
          supportEmail: 'support@example.com',
          autoAssign: true,
          defaultExpiry: 30,
        },
      })
    ).rejects.toThrow('Unauthorized');
  });
});
