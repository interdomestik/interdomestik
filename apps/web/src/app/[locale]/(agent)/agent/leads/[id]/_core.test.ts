import { describe, expect, it, vi } from 'vitest';

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

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmLeads: {
    id: 'crmLeads.id',
  },
  crmDeals: {
    leadId: 'crmDeals.leadId',
    agentId: 'crmDeals.agentId',
    $inferSelect: {} as unknown,
  },
}));

import { getAgentLeadDetailsCore } from './_core';

describe('getAgentLeadDetailsCore', () => {
  it('returns not_found when lead missing', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce(null);

    const result = await getAgentLeadDetailsCore({ leadId: 'l1', viewerAgentId: 'a1' });
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('redirects when lead owned by other agent', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce({ id: 'l1', agentId: 'other' });

    const result = await getAgentLeadDetailsCore({ leadId: 'l1', viewerAgentId: 'a1' });
    expect(result).toEqual({ kind: 'redirect', href: '/agent/leads' });
  });

  it('returns ok when agent owns lead', async () => {
    hoisted.findLeadFirst.mockResolvedValueOnce({ id: 'l1', agentId: 'a1' });
    hoisted.dbSelect.mockReturnValueOnce({
      from: () => ({
        where: async () => [],
      }),
    });

    const result = await getAgentLeadDetailsCore({ leadId: 'l1', viewerAgentId: 'a1' });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.lead).toEqual({ id: 'l1', agentId: 'a1' });
      expect(result.deals).toEqual([]);
    }
  });
});
