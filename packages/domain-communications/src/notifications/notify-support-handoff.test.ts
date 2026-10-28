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
  clearSupportHandoffPublicResponseNotifications,
  notifySupportHandoffPublicResponse,
} from './notify';

describe('support handoff notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockReset();
    mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.onConflictDoNothing.mockResolvedValue(undefined);
  });

  it('persists an in-app support handoff public response notification without email dispatch', async () => {
    mocks.insertValues.mockReturnValueOnce({ onConflictDoNothing: mocks.onConflictDoNothing });
    mocks.findFirst.mockImplementationOnce(
      ({ where }: { where: (...args: unknown[]) => unknown }) => {
        if (typeof where === 'function') {
          where({ id: 'user.id', tenantId: 'user.tenant_id' }, { eq: vi.fn(() => ({ eq: true })) });
        }
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

  it.each([
    [undefined, 'A staff update is available on your support request.'],
    ['', 'New update: support_handoff_public_response'],
    ['Exact content', 'Exact content'],
    ['   ', '   '],
  ])('preserves support handoff content fallback for %j', async (content, expectedContent) => {
    mocks.findFirst.mockResolvedValueOnce({ id: 'member-1', tenantId: 'tenant-1' });
    mocks.insertValues.mockReturnValueOnce({ onConflictDoNothing: mocks.onConflictDoNothing });

    const result = await notifySupportHandoffPublicResponse(
      'member-1',
      { id: 'handoff-1', publicResponseVersion: 3 },
      { tenantId: 'tenant-1', content }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ content: expectedContent })
    );
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
