import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    authGetSession: vi.fn(),
    headers: vi.fn(),
    ensureTenantId: vi.fn(),
    findLead: vi.fn(),
    update,
    set,
    where,
    startPayment: vi.fn(),
    revalidatePath: vi.fn(),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mocks.authGetSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('@interdomestik/domain-leads', () => ({
  startPayment: mocks.startPayment,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      memberLeads: {
        findFirst: mocks.findLead,
      },
    },
    update: mocks.update,
  },
  memberLeads: {
    id: 'member_leads.id',
    tenantId: 'member_leads.tenant_id',
    branchId: 'member_leads.branch_id',
    agentId: 'member_leads.agent_id',
  },
}));

import { convertLeadToClient } from './actions';

describe('convertLeadToClient', () => {
  beforeEach(() => {
    mocks.authGetSession.mockReset();
    mocks.headers.mockReset();
    mocks.ensureTenantId.mockReset();
    mocks.findLead.mockReset();
    mocks.update.mockClear();
    mocks.set.mockClear();
    mocks.where.mockClear();
    mocks.startPayment.mockReset();
    mocks.revalidatePath.mockReset();

    mocks.headers.mockResolvedValue(new Headers());
    mocks.authGetSession.mockResolvedValue({
      user: {
        id: 'agent-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      },
    });
    mocks.ensureTenantId.mockReturnValue('tenant-1');
  });

  it('denies conversion when lead is assigned to another agent and performs no mutation', async () => {
    mocks.findLead.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      agentId: 'agent-2',
    });

    await expect(convertLeadToClient('lead-1')).rejects.toThrow(/access denied/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });

  it('denies conversion when lead tenant does not match session tenant and performs no mutation', async () => {
    mocks.findLead.mockResolvedValue({
      id: 'lead-2',
      tenantId: 'tenant-2',
      branchId: 'branch-1',
      agentId: 'agent-1',
    });

    await expect(convertLeadToClient('lead-2')).rejects.toThrow(/access denied/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });

  it('denies conversion when branch mismatches and session has branchId', async () => {
    mocks.findLead.mockResolvedValue({
      id: 'lead-3',
      tenantId: 'tenant-1',
      branchId: 'branch-2',
      agentId: 'agent-1',
    });

    await expect(convertLeadToClient('lead-3')).rejects.toThrow(/access denied/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });

  it('allows conversion when session has no branchId and lead matches tenant + agent', async () => {
    mocks.authGetSession.mockResolvedValue({
      user: {
        id: 'agent-1',
        tenantId: 'tenant-1',
      },
    });
    mocks.findLead.mockResolvedValue({
      id: 'lead-4',
      tenantId: 'tenant-1',
      branchId: 'branch-2',
      agentId: 'agent-1',
    });

    await expect(convertLeadToClient('lead-4')).resolves.toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });
});
