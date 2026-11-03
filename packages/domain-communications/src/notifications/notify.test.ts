import { authority, mocks } from './notify.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '../email';
import {
  clearSupportHandoffPublicResponseNotifications,
  notifyClaimSubmitted,
  notifyRecoveryDecision,
  notifyStatusChanged,
  notifySupportHandoffPublicResponse,
  sendNotification,
} from './notify';

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

  it('uses the canonical member claim route for status notifications', async () => {
    const sendPushToUser = vi.fn().mockResolvedValue(undefined);
    mocks.findFirst.mockResolvedValue({
      email: 'verified@example.com',
      emailVerified: true,
      tenantId: 'tenant-1',
    });

    expect(
      await notifyStatusChanged(
        'user-1',
        'member@example.com',
        { id: 'claim-1', title: 'Vehicle claim' },
        'submitted',
        'verification',
        { sendPushToUser, authority }
      )
    ).toEqual({ success: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actionUrl: '/member/claims/claim-1' })
    );
    expect(sendPushToUser).toHaveBeenCalledWith(
      'user-1',
      'claim_updates',
      expect.objectContaining({ url: '/member/claims/claim-1' }),
      expect.objectContaining({ authority })
    );
    expect(
      (sendPushToUser.mock.calls[0]?.[3] as { authority: unknown } | undefined)?.authority
    ).toBe(authority);
  });

  it('uses the canonical member claim route for the submitting member', async () => {
    mocks.findFirst.mockResolvedValue({
      email: 'member@example.com',
      emailVerified: false,
      tenantId: 'tenant-1',
    });

    expect(
      await notifyClaimSubmitted(
        'member-1',
        'member@example.com',
        {
          category: 'vehicle',
          id: 'claim-1',
          title: 'Vehicle claim',
        },
        { authority }
      )
    ).toEqual({ success: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actionUrl: '/member/claims/claim-1',
        type: 'claim_submitted',
        userId: 'member-1',
      })
    );
  });

  it('dispatches a recovery decision notification through tenant-scoped in-app and verified-email guards', async () => {
    mocks.findFirst.mockImplementation(({ where }: { where: (...args: unknown[]) => unknown }) => {
      where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return Promise.resolve({
        email: 'verified@example.com',
        emailVerified: true,
        tenantId: 'tenant-1',
      });
    });

    const result = await notifyRecoveryDecision(
      'user-1',
      'member@example.com',
      { id: 'claim-1', title: 'Vehicle claim' },
      'accepted',
      { authority }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.anything(),
      expect.any(Object)
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'escalation_accepted',
        title: 'Recovery accepted',
        actionUrl: '/member/claims/claim-1',
      })
    );
    await vi.waitFor(() =>
      expect(sendEmail).toHaveBeenCalledWith(
        'verified@example.com',
        expect.objectContaining({ subject: 'Recovery accepted' })
      )
    );
  });

  it('persists an in-app support handoff public response notification without email dispatch', async () => {
    mocks.insertValues.mockReturnValueOnce({ onConflictDoNothing: mocks.onConflictDoNothing });
    mocks.findFirst.mockImplementationOnce(
      ({ where }: { where: (...args: unknown[]) => unknown }) => {
        where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
        return Promise.resolve({
          email: 'verified@example.com',
          emailVerified: true,
          tenantId: 'tenant-1',
        });
      }
    );

    const result = await notifySupportHandoffPublicResponse(
      'member-1',
      { id: 'handoff-1', publicResponseVersion: 3 },
      {
        actionUrl: '/sq/member/help?handoffId=handoff-1',
        content: 'Një përditësim nga stafi është i disponueshëm për kërkesën tuaj të mbështetjes.',
        authority,
        title: 'Përditësim nga stafi',
      }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.anything(),
      expect.any(Object)
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actionUrl: '/sq/member/help?handoffId=handoff-1',
        content: 'Një përditësim nga stafi është i disponueshëm për kërkesën tuaj të mbështetjes.',
        id: 'ntf_support_handoff_tenant-1_handoff-1_3',
        tenantId: 'tenant-1',
        title: 'Përditësim nga stafi',
        type: 'support_handoff_public_response',
        userId: 'member-1',
      })
    );
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({ target: expect.anything() });
    expect(sendEmail).not.toHaveBeenCalled();
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
