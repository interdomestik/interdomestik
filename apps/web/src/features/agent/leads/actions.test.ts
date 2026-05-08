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
  ROLES: {
    agent: 'agent',
  },
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('@interdomestik/domain-leads', () => ({
  startPayment: mocks.startPayment,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
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
  and: mocks.and,
  eq: mocks.eq,
}));

import { convertLeadToClient, updateLeadStatus } from './actions';

function resetActionMocks() {
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
  mockSession();
  mocks.ensureTenantId.mockReturnValue('tenant-1');
}

function mockSession(
  user: Record<string, string | undefined> = {
    id: 'agent-1',
    role: 'agent',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
  }
) {
  mocks.authGetSession.mockResolvedValue({ user });
}

function mockLead(id: string) {
  mocks.findLead.mockResolvedValue({
    id,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    agentId: 'agent-1',
  });
}

function expectNoMutation() {
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.startPayment).not.toHaveBeenCalled();
}

function expectNoLookupOrMutation() {
  expect(mocks.findLead).not.toHaveBeenCalled();
  expectNoMutation();
}

function scopedWhereForLead(leadId: string) {
  return expect.objectContaining({
    op: 'and',
    args: expect.arrayContaining([
      expect.objectContaining({ op: 'eq', left: 'member_leads.id', right: leadId }),
      expect.objectContaining({
        op: 'eq',
        left: 'member_leads.tenant_id',
        right: 'tenant-1',
      }),
      expect.objectContaining({ op: 'eq', left: 'member_leads.agent_id', right: 'agent-1' }),
      expect.objectContaining({
        op: 'eq',
        left: 'member_leads.branch_id',
        right: 'branch-1',
      }),
    ]),
  });
}

beforeEach(resetActionMocks);

describe('convertLeadToClient', () => {
  it('denies conversion when scoped lead is not found and performs no mutation', async () => {
    mocks.findLead.mockResolvedValue(null);

    await expect(convertLeadToClient('lead-1')).rejects.toThrow(/not found or access denied/i);
    expectNoMutation();
  });

  it('applies tenant + agent + branch scope constraints when session has branchId', async () => {
    mockLead('lead-2');

    await expect(convertLeadToClient('lead-2')).resolves.toEqual({ success: true });

    const scopedWhere = scopedWhereForLead('lead-2');
    expect(mocks.findLead).toHaveBeenCalledWith({ where: scopedWhere });
    expect(mocks.where).toHaveBeenCalledWith(scopedWhere);
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });

  it('rejects conversion when agent session has no branchId and performs no lookup or mutation', async () => {
    mockSession({ id: 'agent-1', role: 'agent', tenantId: 'tenant-1' });

    await expect(convertLeadToClient('lead-4')).rejects.toThrow(/not found or access denied/i);
    expectNoLookupOrMutation();
  });

  it('rejects when unauthenticated and performs no mutation', async () => {
    mocks.authGetSession.mockResolvedValue(null);

    await expect(convertLeadToClient('lead-5')).rejects.toThrow(/unauthorized/i);
    expectNoLookupOrMutation();
  });
});

describe('updateLeadStatus', () => {
  it('rejects unauthenticated calls and performs no mutation', async () => {
    mocks.authGetSession.mockResolvedValue(null);

    await expect(updateLeadStatus('lead-1', 'contacted')).rejects.toThrow(/unauthorized/i);
    expectNoLookupOrMutation();
  });

  it('rejects when scoped lead is not found and performs no mutation', async () => {
    mocks.ensureTenantId.mockReturnValue('tenant-2');
    mocks.findLead.mockResolvedValue(null);

    await expect(updateLeadStatus('lead-1', 'contacted')).rejects.toThrow(
      /not found or access denied/i
    );
    expectNoMutation();
  });

  it('rejects payment_pending from a non-agent session before lookup or payment', async () => {
    mockSession({ id: 'member-1', role: 'member', tenantId: 'tenant-1', branchId: 'branch-1' });

    await expect(updateLeadStatus('lead-1', 'payment_pending')).rejects.toThrow(
      /not found or access denied/i
    );
    expectNoLookupOrMutation();
  });

  it('does not start payment when payment_pending lead lookup fails', async () => {
    mocks.findLead.mockResolvedValue(null);

    await expect(updateLeadStatus('lead-1', 'payment_pending')).rejects.toThrow(
      /not found or access denied/i
    );
    expectNoMutation();
  });

  it('requires branch scope for agent status updates', async () => {
    mockSession({ id: 'agent-1', role: 'agent', tenantId: 'tenant-1' });

    await expect(updateLeadStatus('lead-1', 'contacted')).rejects.toThrow(
      /not found or access denied/i
    );
    expectNoLookupOrMutation();
  });

  it('applies tenant + agent + branch scope constraints before updating status', async () => {
    mockLead('lead-2');

    await expect(updateLeadStatus('lead-2', 'contacted')).resolves.toEqual({ success: true });

    const scopedWhere = scopedWhereForLead('lead-2');
    expect(mocks.findLead).toHaveBeenCalledWith({ where: scopedWhere });
    expect(mocks.where).toHaveBeenCalledWith(scopedWhere);
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });

  it('starts payment only after the agent-scoped lead lookup succeeds', async () => {
    mockLead('lead-3');

    await expect(updateLeadStatus('lead-3', 'payment_pending')).resolves.toEqual({
      success: true,
    });

    expect(mocks.startPayment).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      {
        leadId: 'lead-3',
        method: 'cash',
        amountCents: 15000,
        priceId: 'default_membership',
      }
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
