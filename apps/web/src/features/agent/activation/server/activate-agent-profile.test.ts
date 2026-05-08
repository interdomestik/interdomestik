import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  returning: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    update: hoisted.update,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  user: {
    id: 'user.id',
    tenantId: 'user.tenant_id',
    role: 'user.role',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
}));

import { activateAgentUserProfile } from './activate-agent-profile';

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.update.mockReturnValue({ set: hoisted.set });
  hoisted.set.mockReturnValue({ where: hoisted.where });
  hoisted.where.mockReturnValue({ returning: hoisted.returning });
  hoisted.returning.mockResolvedValue([{ id: 'member-1' }]);
});

describe('activateAgentUserProfile', () => {
  it('scopes the role update to the authenticated user, tenant, and current role', async () => {
    await expect(
      activateAgentUserProfile({
        currentRole: 'member',
        referralCode: 'ARBEN-1234',
        tenantId: 'tenant-1',
        userId: 'member-1',
      })
    ).resolves.toBeUndefined();

    expect(hoisted.set).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'agent',
        referralCode: 'ARBEN-1234',
        updatedAt: expect.any(Date),
      })
    );
    expect(hoisted.where).toHaveBeenCalledWith({
      op: 'and',
      args: [
        { op: 'eq', left: 'user.id', right: 'member-1' },
        { op: 'eq', left: 'user.tenant_id', right: 'tenant-1' },
        { op: 'eq', left: 'user.role', right: 'member' },
      ],
    });
    expect(hoisted.returning).toHaveBeenCalledWith({ id: 'user.id' });
  });

  it('fails closed when the authenticated scope no longer matches a user row', async () => {
    hoisted.returning.mockResolvedValueOnce([]);

    await expect(
      activateAgentUserProfile({
        currentRole: 'member',
        referralCode: 'ARBEN-1234',
        tenantId: 'tenant-1',
        userId: 'member-1',
      })
    ).rejects.toThrow(/scope no longer matches/i);
  });
});
