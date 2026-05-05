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
  db: {
    query: {
      user: { findFirst: mocks.findFirst },
    },
    delete: mocks.delete,
    insert: mocks.insert,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
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
  clearSupportHandoffPublicResponseNotifications,
  notifyRecoveryDecision,
  notifySupportHandoffPublicResponse,
  sendNotification,
} from './notify';

describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.onConflictDoNothing.mockResolvedValue(undefined);
  });

  it('rejects when tenant does not match user tenant', async () => {
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return Promise.resolve({
        email: 'verified@example.com',
        emailVerified: true,
        tenantId: 'tenant-2',
      });
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

  it('dispatches a recovery decision notification through tenant-scoped in-app and verified-email guards', async () => {
    mocks.findFirst.mockImplementation(({ where }: { where: Function }) => {
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

  it('persists an in-app support handoff public response notification without email dispatch', async () => {
    mocks.insertValues.mockReturnValueOnce({ onConflictDoNothing: mocks.onConflictDoNothing });
    mocks.findFirst.mockImplementationOnce(({ where }: { where: Function }) => {
      where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
      return Promise.resolve({
        email: 'verified@example.com',
        emailVerified: true,
        tenantId: 'tenant-1',
      });
    });

    const result = await notifySupportHandoffPublicResponse(
      'member-1',
      { id: 'handoff-1', publicResponseVersion: 3 },
      {
        actionUrl: '/sq/member/help?handoffId=handoff-1',
        content: 'Një përditësim nga stafi është i disponueshëm për kërkesën tuaj të mbështetjes.',
        tenantId: 'tenant-1',
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
      { tenantId: 'tenant-1' }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.delete).toHaveBeenCalledWith(expect.anything());
    expect(mocks.deleteWhere).toHaveBeenCalledWith(expect.objectContaining({ scoped: true }));
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'notifications.tenant_id',
      expect.any(Object)
    );
  });
});
