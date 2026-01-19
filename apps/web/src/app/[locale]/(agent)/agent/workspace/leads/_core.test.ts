import { describe, expect, it, vi } from 'vitest';
import { getAgentWorkspaceLeadsCore } from './_core';

describe('Agent Workspace Leads Query Contracts', () => {
  describe('getAgentWorkspaceLeadsCore (Integration)', () => {
    const mockDb = {
      query: {
        memberLeads: {
          findMany: vi.fn(),
        },
      },
    };

    it('fetches and maps leads using tenant filter', async () => {
      const mockDate = new Date();
      mockDb.query.memberLeads.findMany.mockResolvedValue([
        { id: 'l1', createdAt: mockDate, updatedAt: mockDate, branch: { name: 'B1' } },
      ]);

      await getAgentWorkspaceLeadsCore({
        tenantId: 't1',
        db: mockDb,
      });

      // Contract: Must apply a where clause for filtering
      expect(mockDb.query.memberLeads.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
    });
  });
});
