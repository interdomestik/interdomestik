import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateWhere: vi.fn(),
  startPayment: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  memberLeads: {
    id: 'member_leads.id',
    tenantId: 'member_leads.tenant_id',
    agentId: 'member_leads.agent_id',
    branchId: 'member_leads.branch_id',
  },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/domain-leads', () => ({ startPayment: hoisted.startPayment }));

import { updateScopedAgentLeadStatus } from './lead-actions';

const authority = mintTestTenantAuthority('tenant-1');
const scope = { agentId: 'agent-1', branchId: 'branch-1', leadId: 'lead-1', authority };

describe('updateScopedAgentLeadStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({
          query: { memberLeads: { findFirst: hoisted.findFirst } },
          update: () => ({ set: () => ({ where: hoisted.updateWhere }) }),
        })
    );
  });

  it('scopes the lead lookup and update to the authority tenant, agent and branch', async () => {
    hoisted.findFirst.mockResolvedValue({ id: 'lead-1', notes: 'a' });

    await expect(
      updateScopedAgentLeadStatus({ scope, status: 'contacted', notes: 'b' })
    ).resolves.toEqual({ success: true });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(1, authority, expect.any(Function));
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(2, authority, expect.any(Function));
    const scopedWhere = hoisted.findFirst.mock.calls[0][0].where;
    expect(scopedWhere.args).toEqual([
      { op: 'eq', left: 'member_leads.id', right: 'lead-1' },
      { op: 'eq', left: 'member_leads.tenant_id', right: 'tenant-1' },
      { op: 'eq', left: 'member_leads.agent_id', right: 'agent-1' },
      { op: 'eq', left: 'member_leads.branch_id', right: 'branch-1' },
    ]);
    expect(hoisted.updateWhere).toHaveBeenCalledWith(scopedWhere);
  });

  it('denies a lead outside the scope without writing', async () => {
    hoisted.findFirst.mockResolvedValue(undefined);

    await expect(updateScopedAgentLeadStatus({ scope, status: 'contacted' })).rejects.toThrow(
      'Lead not found or access denied'
    );
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
  });

  it('starts the cash payment with the authority tenant for payment_pending', async () => {
    hoisted.findFirst.mockResolvedValue({ id: 'lead-1', notes: null });

    await updateScopedAgentLeadStatus({ scope, status: 'payment_pending' });

    expect(hoisted.startPayment).toHaveBeenCalledWith(
      { agentId: 'agent-1', authority, branchId: 'branch-1' },
      expect.objectContaining({ leadId: 'lead-1', method: 'cash' })
    );
    expect(hoisted.startPayment.mock.calls[0][0].authority).toBe(authority);
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
  });
});
