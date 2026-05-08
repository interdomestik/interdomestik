import { describe, expect, it, vi } from 'vitest';
import { getAgentLeadsCore } from './_core';

describe('getAgentLeadsCore', () => {
  const whereEq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));
  const whereAnd = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const orderDesc = vi.fn((column: unknown) => ({ op: 'desc', column }));
  const mockDb = {
    query: {
      memberLeads: {
        findMany: vi.fn(),
      },
    },
  };

  const services = { db: mockDb as never };

  it('fetches leads with branch relation for the tenant, agent, and branch', async () => {
    const mockData = [{ id: 'l1', branch: { name: 'Branch A' } }];
    mockDb.query.memberLeads.findMany.mockResolvedValue(mockData);

    const result = await getAgentLeadsCore(
      { tenantId: 't1', agentId: 'agent-1', branchId: 'branch-1' },
      services
    );

    expect(result).toEqual(mockData);
    expect(mockDb.query.memberLeads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Function),
        with: { branch: true },
      })
    );

    const queryArgs = mockDb.query.memberLeads.findMany.mock.calls[0]?.[0];
    const where = queryArgs?.where(
      {
        tenantId: 'member_leads.tenant_id',
        agentId: 'member_leads.agent_id',
        branchId: 'member_leads.branch_id',
      },
      { and: whereAnd, eq: whereEq }
    );

    expect(where).toEqual({
      op: 'and',
      args: [
        { op: 'eq', left: 'member_leads.tenant_id', right: 't1' },
        { op: 'eq', left: 'member_leads.agent_id', right: 'agent-1' },
        { op: 'eq', left: 'member_leads.branch_id', right: 'branch-1' },
      ],
    });

    const orderBy = queryArgs?.orderBy(
      { createdAt: 'member_leads.created_at' },
      { desc: orderDesc }
    );
    expect(orderBy).toEqual([{ op: 'desc', column: 'member_leads.created_at' }]);
  });
});
