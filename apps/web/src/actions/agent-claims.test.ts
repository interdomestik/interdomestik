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

vi.mock('@interdomestik/database', () => ({
  claims: { id: 'id', status: 'status', userId: 'userId', title: 'title' },
  user: { id: 'id', email: 'email' },
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

describe('Agent Claims Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateClaimStatus', () => {
    it('should throw if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null);
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should throw if user is a regular member', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'member' } });
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should throw if user role is user (not agent/admin)', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
      await expect(updateClaimStatus('claim-1', 'resolved')).rejects.toThrow('Unauthorized');
    });

    it('should allow agent to update claim status', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'agent-1', role: 'agent' } });
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

      await updateClaimStatus('claim-1', 'verification');

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it('should allow admin to update claim status', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
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
      await expect(assignClaim('claim-1', 'agent-2')).rejects.toThrow('Unauthorized');
    });

    it('should throw if claim does not exist', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      mocks.dbQueryUser.mockResolvedValue({ id: 'agent-2', email: 'agent@test.com' });
      mocks.dbQueryClaims.mockResolvedValue(null); // No claim

      await expect(assignClaim('claim-1', 'agent-2')).rejects.toThrow('Claim not found');
    });

    it('should throw if agent does not exist', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      mocks.dbQueryClaims.mockResolvedValue({ id: 'claim-1', title: 'Test Claim' });
      mocks.dbQueryUser.mockResolvedValue(null); // No agent

      await expect(assignClaim('claim-1', 'agent-2')).rejects.toThrow('Agent not found');
    });

    it('should update agentId and notify agent', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      mocks.dbQueryClaims.mockResolvedValue({ id: 'claim-1', title: 'Test Claim' });
      mocks.dbQueryUser.mockResolvedValue({
        id: 'agent-2',
        email: 'agent@test.com',
        name: 'Agent Smith',
      });
      mocks.dbUpdate.mockResolvedValue(undefined);

      await assignClaim('claim-1', 'agent-2');

      expect(mocks.dbUpdate).toHaveBeenCalled();
      expect(notifyClaimAssigned).toHaveBeenCalledWith(
        'agent-2',
        'agent@test.com',
        { id: 'claim-1', title: 'Test Claim' },
        'Agent Smith'
      );
    });
  });
});
