import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@interdomestik/domain-communications/notifications/get', () => ({
  getNotificationsCore: mocks.read,
}));
vi.mock('next-intl/server', () => ({
  getLocale: () => Promise.resolve('en'),
  getTranslations: () => Promise.resolve((key: string) => `trusted:${key}`),
}));
import { getNotificationsCore } from './get.core';
const authority = {} as TenantAuthority;
const session = (role: string) => ({ user: { id: 'user', role } }) as Session;
const row = {
  id: 'notification',
  type: 'new_message',
  title: 'TITLE-SENTINEL',
  content: 'BODY-SENTINEL',
  actionUrl: '/member/claims/id',
  isRead: false,
  createdAt: new Date(),
  tenantId: 'tenant',
  userId: 'user',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue([row]);
});
describe('in-app BM notification reader boundary', () => {
  it.each([
    'new_message',
    'payment_verification_update',
    'support_handoff_public_response',
    'unknown',
    '__proto__',
  ])(
    'replaces %s title and body with trusted event copy and preserves metadata keys',
    async type => {
      mocks.read.mockResolvedValue([{ ...row, type }]);
      const result = await getNotificationsCore({ authority, session: session('branch_manager') });
      expect(result[0]).toMatchObject({
        title: expect.stringMatching(/^trusted:/),
        content: expect.stringMatching(/^trusted:/),
      });
      expect(Object.keys(result[0]).sort()).toEqual(Object.keys(row).sort());
      expect(result[0].id).toBe(row.id);
      expect(JSON.stringify(result)).not.toContain('SENTINEL');
      expect(row.title).toBe('TITLE-SENTINEL');
    }
  );
  it.each([
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('preserves %s rows unchanged', async role => {
    const rows = [row];
    mocks.read.mockResolvedValue(rows);
    expect(await getNotificationsCore({ authority, session: session(role) })).toBe(rows);
  });
  it('preserves empty and failed reads and validates limits before the domain reader', async () => {
    mocks.read.mockResolvedValue([]);
    expect(await getNotificationsCore({ authority, session: session('branch_manager') })).toEqual(
      []
    );
    mocks.read.mockRejectedValue(new Error('read failed'));
    await expect(
      getNotificationsCore({ authority, session: session('branch_manager') })
    ).rejects.toThrow('read failed');
    mocks.read.mockClear();
    await expect(
      getNotificationsCore({ authority, session: session('staff'), limit: 101 })
    ).rejects.toThrow('Invalid limit');
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
