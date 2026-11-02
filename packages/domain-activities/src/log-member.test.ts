import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logActivityCore } from './log-member';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  findMember: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  nanoid: vi.fn(() => 'MEM-ACT-1'),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
  },
  withTenantContext: mocks.withTenantContext,
  memberActivities: {
    id: 'memberActivities.id',
    memberId: 'memberActivities.memberId',
  },
  user: {
    id: 'user.id',
  },
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

describe('logActivityCore', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  const validData = {
    memberId: 'member-1',
    type: 'call' as const,
    subject: 'Called member',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({
          query: { user: { findFirst: mocks.findMember } },
          insert: mocks.insert,
        })
    );
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.findMember.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant-1',
      agentId: 'agent-1',
    });
  });

  it('denies cross-tenant activity writes', async () => {
    mocks.findMember.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant-2',
      agentId: 'agent-1',
    });

    const result = await logActivityCore({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
      },
      authority,
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Member access denied' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('denies agent writes for unassigned member', async () => {
    mocks.findMember.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant-1',
      agentId: 'agent-2',
    });

    const result = await logActivityCore({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
      },
      authority,
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Member access denied' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('allows assigned agent and writes activity', async () => {
    const result = await logActivityCore({
      session: {
        user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
      },
      authority,
      data: validData,
    });

    expect(result).toEqual({ success: true });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'MEM-ACT-1',
        tenantId: 'tenant-1',
        memberId: 'member-1',
        agentId: 'agent-1',
      })
    );
  });
});
