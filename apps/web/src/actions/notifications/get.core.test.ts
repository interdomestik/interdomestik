import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';
const mocks = vi.hoisted(() => ({ read: vi.fn(), claim: vi.fn() }));
vi.mock('@interdomestik/domain-claims', () => ({
  getMemberClaimTitle: mocks.claim,
}));
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
  previewRestricted: false,
  isRead: false,
  createdAt: new Date(),
  tenantId: 'tenant',
  userId: 'user',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue([row]);
  mocks.claim.mockResolvedValue('Visible claim');
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
      expect(Object.keys(result[0]).sort((a, b) => a.localeCompare(b))).toEqual(
        Object.keys(row).sort((a, b) => a.localeCompare(b))
      );
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
  ])('localizes %s copy and preserves navigation/read metadata', async role => {
    const rows = [row];
    mocks.read.mockResolvedValue(rows);
    const result = await getNotificationsCore({ authority, session: session(role) });
    expect(result[0]).toMatchObject({
      ...row,
      title: 'trusted:events.newMessage.title',
      content: 'trusted:updateOn',
    });
    expect(mocks.claim).toHaveBeenCalledTimes(role === 'member' ? 1 : 0);
  });
  it.each(['missing', 'denied'])('uses neutral copy for %s raw-ID claim lookups', async () => {
    mocks.claim.mockResolvedValue(null);
    const result = await getNotificationsCore({ authority, session: session('member') });
    expect(result[0]).toMatchObject({
      ...row,
      title: 'trusted:events.newMessage.title',
      content: 'trusted:updateOn',
    });
  });
  it('surfaces a failed claim lookup as a typed inbox failure', async () => {
    mocks.claim.mockRejectedValueOnce(new Error('claim lookup failed'));
    await expect(
      getNotificationsCore({ authority, session: session('member') })
    ).rejects.toMatchObject({
      code: 'CLAIM_LOOKUP_FAILED',
    });
  });
  it('uses restricted copy after a branch-manager claim owner becomes a member', async () => {
    mocks.read.mockResolvedValue([{ ...row, previewRestricted: true }]);
    const before = await getNotificationsCore({ authority, session: session('branch_manager') });
    const result = await getNotificationsCore({ authority, session: session('member') });
    expect(result).toEqual(before);
    expect(result[0]).toMatchObject({
      title: 'trusted:newMessage.title',
      content: 'trusted:newMessage.content',
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it.each(['Update on: PRIVATE-CLAIM-TITLE', 'Update on: id'])(
    'uses generic copy for an unknown legacy claim message with content %s',
    async content => {
      const legacy = { ...row, previewRestricted: null, content };
      mocks.read.mockResolvedValue([legacy]);
      const result = await getNotificationsCore({ authority, session: session('member') });
      expect(result[0]).toEqual({
        ...legacy,
        title: 'trusted:newMessage.title',
        content: 'trusted:newMessage.content',
      });
      expect(mocks.claim).not.toHaveBeenCalled();
    }
  );
  it.each([row, { ...row, type: 'claim_status_changed', previewRestricted: null }])(
    'resolves each admitted $type thread once and avoids lookups for stored titles or BM',
    async update => {
      mocks.read.mockResolvedValue([update, { ...update, id: 'second' }]);
      await getNotificationsCore({ authority, session: session('member') });
      expect(mocks.claim).toHaveBeenCalledExactlyOnceWith({ authority, claimId: 'id' });
      mocks.claim.mockClear();
      mocks.read.mockResolvedValue([{ ...update, content: 'Update on: Car damage' }]);
      await getNotificationsCore({ authority, session: session('member') });
      await getNotificationsCore({ authority, session: session('branch_manager') });
      expect(mocks.claim).not.toHaveBeenCalled();
    }
  );
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
