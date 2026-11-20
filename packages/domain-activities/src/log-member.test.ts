import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logActivityCore } from './log-member';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  findMember: vi.fn(),
  findAssignment: vi.fn(),
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
  and: (...conditions: unknown[]) => ({ and: conditions }),
  agentClients: {
    id: 'agentClients.id',
    tenantId: 'agentClients.tenantId',
    agentId: 'agentClients.agentId',
    memberId: 'agentClients.memberId',
    status: 'agentClients.status',
  },
  memberActivities: {
    id: 'memberActivities.id',
    memberId: 'memberActivities.memberId',
  },
  user: {
    id: 'user.id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (field: unknown, value: unknown) => ({ eq: [field, value] }),
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
          query: {
            user: { findFirst: mocks.findMember },
            agentClients: { findFirst: mocks.findAssignment },
          },
          insert: mocks.insert,
        })
    );
    mocks.execute.mockResolvedValue([{ regclass: 'member_activities' }]);
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.findAssignment.mockResolvedValue(undefined);
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

  it('allows an agent with an active client assignment but no legacy member link', async () => {
    mocks.findMember.mockResolvedValue({ id: 'member-1', tenantId: 'tenant-1', agentId: null });
    mocks.findAssignment.mockResolvedValue({ id: 'assignment-1' });

    const result = await logActivityCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      authority,
      data: validData,
    });

    expect(result).toEqual({ success: true });
    expect(mocks.findAssignment).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', memberId: 'member-1', agentId: 'agent-1' })
    );
  });

  it('checks the assignment for the session agent, tenant and member only when active', async () => {
    mocks.findMember.mockResolvedValue({ id: 'member-1', tenantId: 'tenant-1', agentId: null });

    const result = await logActivityCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      authority,
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Member access denied' });
    expect(mocks.insert).not.toHaveBeenCalled();
    const query = mocks.findAssignment.mock.calls[0]?.[0];
    expect(query.where).toEqual({
      and: [
        { eq: ['agentClients.tenantId', 'tenant-1'] },
        { eq: ['agentClients.agentId', 'agent-1'] },
        { eq: ['agentClients.memberId', 'member-1'] },
        { eq: ['agentClients.status', 'active'] },
      ],
    });
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
