import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findLeadFirst: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      crmLeads: {
        findFirst: hoisted.findLeadFirst,
      },
    },
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId: unknown, col: unknown, conds?: unknown) => ({
    withTenant: [tenantId, col, conds],
  })),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmLeads: {
    id: 'crmLeads.id',
    tenantId: 'crmLeads.tenantId',
    agentId: 'crmLeads.agentId',
  },
  crmDeals: {
    tenantId: 'crmDeals.tenantId',
    leadId: 'crmDeals.leadId',
    agentId: 'crmDeals.agentId',
    $inferSelect: {} as unknown,
  },
}));

import { getAgentLeadDetailsCore } from './_core';

describe('getAgentLeadDetailsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_found when lead missing', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce(null);

    const result = await getAgentLeadDetailsCore({
      leadId: 'l1',
      tenantId: 'tenant-1',
      viewerAgentId: 'a1',
    });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns not_found when no lead matches the tenant and viewer agent scope', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce(null);

    const result = await getAgentLeadDetailsCore({
      leadId: 'l1',
      tenantId: 'tenant-1',
      viewerAgentId: 'a1',
    });
    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });

  it('returns ok when agent owns lead', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce({ id: 'l1', agentId: 'a1' });
    hoisted.dbSelect.mockReturnValueOnce({
      from: () => ({
        where: async () => [],
      }),
    });

    const result = await getAgentLeadDetailsCore({
      leadId: 'l1',
      tenantId: 'tenant-1',
      viewerAgentId: 'a1',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.lead).toEqual({ id: 'l1', agentId: 'a1' });
      expect(result.deals).toEqual([]);
    }
  });

  it('filters lead and deal reads by tenant and viewer agent', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce({ id: 'l1', agentId: 'a1' });
    const where = vi.fn().mockResolvedValue([]);
    hoisted.dbSelect.mockReturnValueOnce({
      from: vi.fn(() => ({ where })),
    });

    await getAgentLeadDetailsCore({
      leadId: 'l1',
      tenantId: 'tenant-1',
      viewerAgentId: 'a1',
    });

    expect(hoisted.findLeadFirst).toHaveBeenCalledWith({
      where: {
        withTenant: [
          'tenant-1',
          'crmLeads.tenantId',
          { and: [{ eq: ['crmLeads.id', 'l1'] }, { eq: ['crmLeads.agentId', 'a1'] }] },
        ],
      },
    });
    expect(where).toHaveBeenCalledWith({
      withTenant: [
        'tenant-1',
        'crmDeals.tenantId',
        { and: [{ eq: ['crmDeals.leadId', 'l1'] }, { eq: ['crmDeals.agentId', 'a1'] }] },
      ],
    });
  });
});
