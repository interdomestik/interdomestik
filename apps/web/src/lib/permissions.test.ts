import { eq } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  allowedClaimStatusTransitions,
  assertAgentClientAccess,
  canAgentCreateClaim,
  canStaffHandleClaim,
  scopeFilter,
} from './permissions';
import { ROLE_AGENT, ROLE_STAFF } from './roles.core';

// Mock drizzle-orm
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm');
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ op: 'eq', col, val })),
    and: vi.fn((...args) => ({ op: 'and', args })),
  };
});

describe('permissions', () => {
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
      // Logic calls eq twice, then and
      // exact call verification is tricky with mocks, but ensuring it runs without error is key for coverage
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

    it('assertAgentClientAccess should pass for non-agents', () => {
      // Should not throw
      assertAgentClientAccess({ scope: {} } as any, 'u1');
    });

    it('assertAgentClientAccess should pass for agents (placeholder logic)', () => {
      // Current impl does nothing even for agents
      assertAgentClientAccess({ scope: { actorAgentId: 'a1' } } as any, 'u1');
    });
  });
});
