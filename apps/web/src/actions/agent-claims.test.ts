import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock variables must be defined before vi.mock is called
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbUpdate: vi.fn(),
  dbSelect: vi.fn(),
  dbQueryUser: vi.fn(),
  dbQueryClaims: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mocks.getSession(),
    },
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifyClaimAssigned: vi.fn().mockResolvedValue({ success: true }),
  notifyStatusChanged: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@interdomestik/database', () => ({
  claims: {
    id: { name: 'id' },
    tenantId: { name: 'tenantId' },
    status: { name: 'status' },
    staffId: { name: 'staffId' },
    userId: { name: 'userId' },
    title: { name: 'title' },
  },
  user: { id: { name: 'id' }, tenantId: { name: 'tenantId' }, email: { name: 'email' } },
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => mocks.dbSelect(),
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: mocks.dbUpdate }),
    }),
    query: {
      user: {
        findFirst: () => mocks.dbQueryUser(),
      },
      claims: {
        findFirst: () => mocks.dbQueryClaims(),
      },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { notifyClaimAssigned } from '@/lib/notifications';
import { assignClaim, updateClaimStatus } from './agent-claims';

describe('Staff Claims Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateClaimStatus', () => {
    it('should throw if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null);
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should throw if user is a regular member', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
      });
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should throw if user role is user (not staff/admin)', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
      });
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should throw if user role is agent (sales only)', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_mk' },
      });
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should allow staff to update claim status', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
      });
      mocks.dbSelect.mockResolvedValue([
        {
          id: 'claim-1',
          title: 'Test Claim',
          status: 'submitted',
          staffId: 'staff-1',
          userId: 'user-1',
          userEmail: 'user@test.com',
        },
      ]);
      mocks.dbUpdate.mockResolvedValue(undefined);

      await updateClaimStatus('claim-1', 'verification');

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it('should allow admin to update claim status', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mocks.dbSelect.mockResolvedValue([
        {
          id: 'claim-1',
          title: 'Test Claim',
          status: 'submitted',
          userId: 'user-1',
          userEmail: 'user@test.com',
        },
      ]);
      mocks.dbUpdate.mockResolvedValue(undefined);

      await updateClaimStatus('claim-1', 'resolved');

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });
  });

  describe('assignClaim', () => {
    it('should throw if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null);
      await expect(assignClaim('claim-1', 'staff-2')).rejects.toThrow('Unauthorized');
    });

    it('should not allow staff to assign claims to someone else', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
      });

      await expect(assignClaim('claim-1', 'staff-2')).rejects.toThrow('Access denied');
      expect(mocks.dbUpdate).not.toHaveBeenCalled();
    });

    it('should throw if claim does not exist', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mocks.dbQueryUser.mockResolvedValue({ id: 'staff-2', email: 'staff@test.com' });
      mocks.dbQueryClaims.mockResolvedValue(null); // No claim

      await expect(assignClaim('claim-1', 'staff-2')).rejects.toThrow('Claim not found');
    });

    it('should throw if staff member does not exist', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mocks.dbQueryClaims.mockResolvedValue({ id: 'claim-1', title: 'Test Claim' });
      mocks.dbQueryUser.mockResolvedValue(null); // No agent

      await expect(assignClaim('claim-1', 'staff-2')).rejects.toThrow('Staff member not found');
    });

    it('should update staffId and notify staff', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mocks.dbQueryClaims.mockResolvedValue({ id: 'claim-1', title: 'Test Claim' });
      mocks.dbQueryUser.mockResolvedValue({
        id: 'staff-2',
        email: 'staff@test.com',
        name: 'Staff Smith',
      });
      mocks.dbUpdate.mockResolvedValue(undefined);

      await assignClaim('claim-1', 'staff-2');

      expect(mocks.dbUpdate).toHaveBeenCalled();
      expect(notifyClaimAssigned).toHaveBeenCalledWith(
        'staff-2',
        'staff@test.com',
        { id: 'claim-1', title: 'Test Claim' },
        'Staff Smith'
      );
    });
  });
});
