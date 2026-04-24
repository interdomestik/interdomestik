import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

mocks.insert.mockReturnValue({ values: mocks.insertValues });

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: { findFirst: mocks.findFirst },
    },
    insert: mocks.insert,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  notifications: 'notifications',
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
import { notifyRecoveryDecision, sendNotification } from './notify';

describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
  });

  it('rejects when tenant does not match user tenant', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return Promise.resolve({ emailVerified: true, tenantId: 'tenant-2' });
    });

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
    mocks.findFirst.mockResolvedValueOnce({ emailVerified: false, tenantId: 'tenant-1' });

    const result = await sendNotification('user-1', 'new_message', { claimId: 'claim-1' });

    expect(result).toEqual({ success: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        type: 'new_message',
      })
    );
  });

  it('dispatches a recovery decision notification through tenant-scoped in-app and verified-email guards', async () => {
    mocks.findFirst.mockImplementation(({ where }: { where: Function }) => {
      where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return Promise.resolve({ emailVerified: true, tenantId: 'tenant-1' });
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
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled());
  });
});
