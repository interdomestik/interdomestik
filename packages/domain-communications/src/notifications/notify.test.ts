import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

mocks.insert.mockReturnValue({ values: mocks.insertValues });

vi.mock('@interdomestik/database', () => ({
  user: { id: 'user.id', tenantId: 'user.tenant_id' },
  notifications: {
    id: 'notifications.id',
    tenantId: 'notifications.tenant_id',
    type: 'notifications.type',
    userId: 'notifications.user_id',
  },
  withTenantContext: vi.fn(async (_context, action) =>
    action({
      query: { user: { findFirst: mocks.findFirst } },
      insert: mocks.insert,
      delete: mocks.delete,
    })
  ),
  db: {
    query: {
      user: { findFirst: mocks.findFirst },
    },
    delete: mocks.delete,
    insert: mocks.insert,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'user.id', tenantId: 'user.tenant_id' },
  notifications: {
    id: 'notifications.id',
    tenantId: 'notifications.tenant_id',
    type: 'notifications.type',
    userId: 'notifications.user_id',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('../email', () => ({
  sendClaimAssignedEmail: vi.fn(),
  sendClaimSubmittedEmail: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
  sendNewMessageEmail: vi.fn(),
  sendPaymentVerificationEmail: vi.fn(),
  sendStatusChangedEmail: vi.fn(),
}));

import { sendEmail } from '../email';
import {
  notifyClaimSubmitted,
  notifyRecoveryDecision,
  notifyStatusChanged,
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
      { tenantId: 'tenant-1' }
    );

    expect(result).toEqual({ success: false, error: 'Tenant mismatch for notification' });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.anything(),
      expect.any(Object)
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('persists an in-app notification when the recipient email is not verified', async () => {
    mocks.findFirst.mockResolvedValueOnce({
      email: 'unverified@example.com',
      emailVerified: false,
      tenantId: 'tenant-1',
    });

    const result = await sendNotification('user-1', 'new_message', { claimId: 'claim-1' });

    expect(result).toEqual({ success: true });
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
        { sendPushToUser, tenantId: 'tenant-1' }
      )
    ).toEqual({ success: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actionUrl: '/member/claims/claim-1' })
    );
    expect(sendPushToUser).toHaveBeenCalledWith(
      'user-1',
      'claim_updates',
      expect.objectContaining({ url: '/member/claims/claim-1' })
    );
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
        { tenantId: 'tenant-1' }
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
      { tenantId: 'tenant-1' }
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
});
