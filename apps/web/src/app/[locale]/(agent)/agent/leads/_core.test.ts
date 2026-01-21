import { describe, expect, it, vi } from 'vitest';
import { getAgentLeadsCore } from './_core';

describe('getAgentLeadsCore', () => {
  const mockDb = {
    query: {
      memberLeads: {
        findMany: vi.fn(),
      },
    },
  };

  const services = { db: mockDb as any };

  it('fetches leads with branch relation for a tenant', async () => {
    const mockData = [{ id: 'l1', branch: { name: 'Branch A' } }];
    mockDb.query.memberLeads.findMany.mockResolvedValue(mockData);

    const result = await getAgentLeadsCore({ tenantId: 't1' }, services);

    expect(result).toEqual(mockData);
    expect(mockDb.query.memberLeads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { branch: true },
      })
    );
  });
});
