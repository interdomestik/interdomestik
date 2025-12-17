import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock variables must be defined before vi.mock is called
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mocks.getSession(),
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  claims: { id: 'id', status: 'status' },
  db: {
    update: () => ({
      set: () => ({ where: mocks.dbUpdate }),
    }),
  },
  eq: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { updateClaimStatus } from './agent-claims';

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
      mocks.dbUpdate.mockResolvedValue(undefined);

      await updateClaimStatus('claim-1', 'verification');

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });

    it('should allow admin to update claim status', async () => {
      mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
      mocks.dbUpdate.mockResolvedValue(undefined);

      await updateClaimStatus('claim-1', 'resolved');

      expect(mocks.dbUpdate).toHaveBeenCalled();
    });
  });
});
