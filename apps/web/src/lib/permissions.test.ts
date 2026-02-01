import { db } from '@interdomestik/database/db';
import { agentClients } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allowedClaimStatusTransitions,
  assertAgentClientAccess,
  canAgentCreateClaim,
  canStaffHandleClaim,
  scopeFilter,
} from './permissions';
import { ROLE_AGENT, ROLE_STAFF } from './roles.core';
import type { ProtectedActionContext } from './safe-action';

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
    } as unknown as ProtectedActionContext;

    it('should filter by branchId if present', () => {
      scopeFilter(mockCtx, { branchId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'branch_1');
    });

    it('should filter by agentId if acting as agent', () => {
      const agentCtx = {
        scope: { actorAgentId: 'agent_1' },
      } as unknown as ProtectedActionContext;
      scopeFilter(agentCtx, { agentId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'agent_1');
    });

    it('should fallback to userId if agentId column missing but user acting as agent', () => {
      const agentCtx = {
        scope: { actorAgentId: 'agent_1' },
      } as unknown as ProtectedActionContext;
      scopeFilter(agentCtx, { userId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'agent_1');
    });

    it('should combine filters', () => {
      const fullCtx = {
        scope: { branchId: 'branch_1', actorAgentId: 'agent_1' },
      } as unknown as ProtectedActionContext;
      scopeFilter(fullCtx, { branchId: mockCol, agentId: mockCol });
      expect(eq).toHaveBeenCalledWith(mockCol, 'branch_1');
      expect(eq).toHaveBeenCalledWith(mockCol, 'agent_1');
    });

    it('should return undefined if no filters apply', () => {
      const emptyCtx = { scope: {} } as unknown as ProtectedActionContext;
      const res = scopeFilter(emptyCtx, { branchId: mockCol });
      expect(res).toBeUndefined();
    });
  });

  describe('helpers', () => {
    it('canAgentCreateClaim should return true if actorAgentId exists', () => {
      expect(
        canAgentCreateClaim({
          scope: { actorAgentId: 'a1' },
        } as unknown as ProtectedActionContext)
      ).toBe(true);
      expect(canAgentCreateClaim({ scope: {} } as unknown as ProtectedActionContext)).toBe(false);
    });

    it('canStaffHandleClaim should return true if actorAgentId is missing', () => {
      expect(canStaffHandleClaim({ scope: {} } as unknown as ProtectedActionContext)).toBe(true);
      expect(
        canStaffHandleClaim({
          scope: { actorAgentId: 'a1' },
        } as unknown as ProtectedActionContext)
      ).toBe(false);
    });

    it('allowedClaimStatusTransitions should return correct statuses', () => {
      expect(allowedClaimStatusTransitions(ROLE_AGENT)).toEqual(['draft', 'submitted']);
      expect(allowedClaimStatusTransitions(ROLE_STAFF)).toContain('paid');
    });

    describe('assertAgentClientAccess', () => {
      it('should pass for non-agents (e.g. admin/staff)', async () => {
        await assertAgentClientAccess({ scope: {} } as unknown as ProtectedActionContext, 'u1');
        expect(db.select).not.toHaveBeenCalled();
      });

      it('✅ Allowed: Active assignment exists', async () => {
        // Mock DB finding a valid link
        vi.mocked(
          db.select().from(agentClients).where(eq(agentClients.id, '1')).limit
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ).mockResolvedValue([{ id: 'link1' }] as any[]);
        // Simpler mock setup for chain
        const mockLimit = vi.fn().mockResolvedValue([{ id: 'link1' }]);
        const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

        await expect(
          assertAgentClientAccess(
            {
              tenantId: 't1',
              scope: { actorAgentId: 'a1' },
            } as unknown as ProtectedActionContext,
            'client1'
          )
        ).resolves.not.toThrow();

        // Verify the query structure
        expect(db.select).toHaveBeenCalled();
        expect(mockFrom).toHaveBeenCalled();
        expect(mockWhere).toHaveBeenCalled();
      });

      it('❌ Denied: Unassigned agent (no link found)', async () => {
        // Mock DB returning empty (no match)
        const mockLimit = vi.fn().mockResolvedValue([]);
        const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

        const promise = assertAgentClientAccess(
          {
            tenantId: 't1',
            scope: { actorAgentId: 'a1' },
          } as unknown as ProtectedActionContext,
          'client1'
        );

        await expect(promise).rejects.toThrow('Security Violation: Unauthorized client access.');
      });

      it('🔍 Verify Strict Query Filters (Tenant, Agent, Client, Active)', async () => {
        const mockLimit = vi.fn().mockResolvedValue([{ id: 'link1' }]);
        const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

        await assertAgentClientAccess(
          {
            tenantId: 'tenant_X',
            scope: { actorAgentId: 'agent_Y' },
          } as unknown as ProtectedActionContext,
          'client_Z'
        );

        // Capture the 'where' call arguments to verify strict filtering
        const whereCall = mockWhere.mock.calls[0][0];
        // Based on our mock at top: and(...) returns { op: 'and', args: [...] }
        expect(whereCall.op).toBe('and');
        const filters = whereCall.args;

        // We expect 4 conditions: tenantId, agentId, memberId, status
        expect(filters).toHaveLength(4);

        // Helper to find filter for a specific column name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
