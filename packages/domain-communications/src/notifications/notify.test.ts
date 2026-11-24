import { authority, mocks } from './notify.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSupportHandoffPublicResponseNotifications, sendNotification } from './notify';

describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockReset();
    mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.onConflictDoNothing.mockResolvedValue(undefined);
  });

  it('rejects when tenant does not match user tenant', async () => {
    mocks.findFirst.mockImplementationOnce(
      ({ where }: { where: (...args: unknown[]) => unknown }) => {
        where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
        return Promise.resolve({
          email: 'verified@example.com',
          emailVerified: true,
          tenantId: 'tenant-2',
        });
      }
    );

    const result = await sendNotification(
      'user-1',
      'new_message',
      { claimId: 'claim-1' },
      { authority }
    );

    expect(result).toEqual({ success: false, error: 'Tenant mismatch for notification' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.anything(),
      expect.any(Object)
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses to notify without a tenant authority and touches no tenant data', async () => {
    const result = await sendNotification(
      'user-1',
      'new_message',
      { claimId: 'claim-1' },
      { authority: undefined as never }
    );

    expect(result).toEqual({ success: false, error: 'Missing tenant authority for notification' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('persists an in-app notification when the recipient email is not verified', async () => {
    mocks.findFirst.mockResolvedValueOnce({
      email: 'unverified@example.com',
      emailVerified: false,
      tenantId: 'tenant-1',
    });

    const result = await sendNotification(
      'user-1',
      'new_message',
      { claimId: 'claim-1' },
      { authority }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    for (const call of mocks.withTenantContext.mock.calls) expect(call[0]).toBe(authority);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        type: 'new_message',
      })
    );
  });

  it('clears in-app support handoff public response notifications for a closed handoff', async () => {
    const result = await clearSupportHandoffPublicResponseNotifications(
      'member-1',
      { id: 'handoff-1' },
      { authority }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    for (const call of mocks.withTenantContext.mock.calls) expect(call[0]).toBe(authority);
    expect(mocks.delete).toHaveBeenCalledWith(expect.anything());
    expect(mocks.deleteWhere).toHaveBeenCalledWith(expect.objectContaining({ scoped: true }));
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'notifications.tenant_id',
      expect.any(Object)
    );
  });
});
