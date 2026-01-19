import { describe, expect, it, vi } from 'vitest';
import { getAgentWorkspaceLeadsCore } from './_core';

describe('getAgentWorkspaceLeadsCore', () => {
  const mockDb = {
    query: {
      memberLeads: {
        findMany: vi.fn(),
      },
    },
  };

  it('fetches and maps leads', async () => {
    const mockLeads = [
      {
        id: 'l1',
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: { name: 'Main' },
      },
    ];
    mockDb.query.memberLeads.findMany.mockResolvedValue(mockLeads);

    const result = await getAgentWorkspaceLeadsCore({
      tenantId: 't1',
      db: mockDb,
    });

    expect(result.leads.length).toBe(1);
    expect(result.leads[0].id).toBe('l1');
    expect(result.leads[0].branch?.name).toBe('Main');
  });
});
