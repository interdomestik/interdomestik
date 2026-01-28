import { and, eq } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  allowedClaimStatusTransitions,
  assertAgentClientAccess,
  canAgentCreateClaim,
  canStaffHandleClaim,
  scopeFilter,
} from './permissions';
import { ROLE_AGENT, ROLE_STAFF } from './roles.core';
import { db } from '@interdomestik/database/db';

// Mock drizzle-orm
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm');
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ op: 'eq', col, val })),
    and: vi.fn((...args) => ({ op: 'and', args })),
  };
});

// Mock database
vi.mock('@interdomestik/database/db', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn(), // Necessary for Awaitable
  };
  return { db: mockDb };
});

// Mock database schema
vi.mock('@interdomestik/database/schema', () => ({
  agentClients: {
    id: { name: 'id' },
    tenantId: { name: 'tenantId' },
    agentId: { name: 'agentId' },
    memberId: { name: 'memberId' },
    status: { name: 'status' },
  },
}));

describe('permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scopeFilter', () => {
    const mockCol = { name: 'col' } as unknown as PgColumn;
    const mockCtx = {
      scope: {
        branchId: 'branch_1',
        actorAgentId: undefined,
      },
    } as any;

    it('should filter by branchId if present', () => {
      scopeFilter(mockCtx, { branchId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'branch_1');
    });

    it('should filter by agentId if acting as agent', () => {
      const agentCtx = { scope: { actorAgentId: 'agent_1' } } as any;
      scopeFilter(agentCtx, { agentId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'agent_1');
    });

    it('should fallback to userId if agentId column missing but user acting as agent', () => {
      const agentCtx = { scope: { actorAgentId: 'agent_1' } } as any;
      scopeFilter(agentCtx, { userId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'agent_1');
    });

    it('should combine filters', () => {
      const fullCtx = { scope: { branchId: 'branch_1', actorAgentId: 'agent_1' } } as any;
      scopeFilter(fullCtx, { branchId: mockCol, agentId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'branch_1');
      expect(eq).toHaveBeenCalledWith(mockCol, 'agent_1');
    });

    it('should return undefined if no filters apply', () => {
      const emptyCtx = { scope: {} } as any;
      const res = scopeFilter(emptyCtx, { branchId: mockCol });
      expect(res).toBeUndefined();
    });
  });

  describe('helpers', () => {
    it('canAgentCreateClaim should return true if actorAgentId exists', () => {
      expect(canAgentCreateClaim({ scope: { actorAgentId: 'a1' } } as any)).toBe(true);
      expect(canAgentCreateClaim({ scope: {} } as any)).toBe(false);
    });

    it('canStaffHandleClaim should return true if actorAgentId is missing', () => {
      expect(canStaffHandleClaim({ scope: {} } as any)).toBe(true);
      expect(canStaffHandleClaim({ scope: { actorAgentId: 'a1' } } as any)).toBe(false);
    });

    it('allowedClaimStatusTransitions should return correct statuses', () => {
      expect(allowedClaimStatusTransitions(ROLE_AGENT)).toEqual(['draft', 'submitted']);
      expect(allowedClaimStatusTransitions(ROLE_STAFF)).toContain('paid');
    });

    describe('assertAgentClientAccess', () => {
      it('should pass for non-agents (e.g. admin/staff)', async () => {
        await assertAgentClientAccess({ scope: {} } as any, 'u1');
        expect(db.select).not.toHaveBeenCalled();
      });

      it('✅ Allowed: Active assignment exists', async () => {
        // Mock DB finding a valid link
        (db as any).limit.mockResolvedValue([{ id: 'link1' }]);

        await expect(
          assertAgentClientAccess(
            { tenantId: 't1', scope: { actorAgentId: 'a1' } } as any,
            'client1'
          )
        ).resolves.not.toThrow();

        // Verify the query structure
        expect(db.select).toHaveBeenCalled();
        expect((db as any).from).toHaveBeenCalled();
        expect((db as any).where).toHaveBeenCalled();
      });

      it('❌ Denied: Unassigned agent (no link found)', async () => {
        // Mock DB returning empty (no match)
        (db as any).limit.mockResolvedValue([]);

        const promise = assertAgentClientAccess(
          { tenantId: 't1', scope: { actorAgentId: 'a1' } } as any,
          'client1'
        );

        await expect(promise).rejects.toThrow('Security Violation: Unauthorized client access.');
      });

      it('🔍 Verify Strict Query Filters (Tenant, Agent, Client, Active)', async () => {
        (db as any).limit.mockResolvedValue([{ id: 'link1' }]);

        await assertAgentClientAccess(
          { tenantId: 'tenant_X', scope: { actorAgentId: 'agent_Y' } } as any,
          'client_Z'
        );

        // Capture the 'where' call arguments to verify strict filtering
        const whereCall = (db as any).where.mock.calls[0][0];
        // Based on our mock at top: and(...) returns { op: 'and', args: [...] }
        expect(whereCall.op).toBe('and');
        const filters = whereCall.args;

        // We expect 4 conditions: tenantId, agentId, memberId, status
        expect(filters).toHaveLength(4);

        // Helper to find filter for a specific column name
        const findFilter = (colName: string) => filters.find((f: any) => f.col.name === colName);

        const tenantFilter = findFilter('tenantId');
        const agentFilter = findFilter('agentId');
        const memberFilter = findFilter('memberId');
        const statusFilter = findFilter('status');

        expect(tenantFilter).toMatchObject({ val: 'tenant_X' });
        expect(agentFilter).toMatchObject({ val: 'agent_Y' });
        expect(memberFilter).toMatchObject({ val: 'client_Z' });
        expect(statusFilter).toMatchObject({ val: 'active' });
      });
    });
  });
});
