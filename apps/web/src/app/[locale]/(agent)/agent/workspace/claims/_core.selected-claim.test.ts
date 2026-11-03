import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContextMock: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContextMock,
}));

import { baseParams, callCore, claimRow, createTx } from './_core.test-support';

function runActionWithTx(tx: ReturnType<typeof createTx>) {
  hoisted.withTenantContextMock.mockImplementation(
    async (_context: unknown, action: (tx: unknown) => Promise<unknown>) => action(tx)
  );
}

describe('getAgentWorkspaceClaimsCore selected claim', () => {
  beforeEach(() => {
    hoisted.withTenantContextMock.mockReset();
  });

  it('injects selected claim when selectedClaimId is not in initial page', async () => {
    const tx = createTx();
    runActionWithTx(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }, { memberId: 'u2' }]);
    tx.query.claims.findMany
      .mockResolvedValueOnce([claimRow('visible-1', 'u1')])
      .mockResolvedValueOnce([claimRow('target-1', 'u2')]);
    tx.groupBy.mockResolvedValueOnce([
      { claimId: 'visible-1', count: 0 },
      { claimId: 'target-1', count: 2 },
    ]);
    tx.orderBy.mockResolvedValueOnce([
      { claimId: 'visible-1', content: 'hello' },
      { claimId: 'target-1', content: 'selected-message' },
    ]);

    const result = await callCore({
      ...baseParams,
      selectedClaimId: 'target-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toHaveLength(2);
      expect(result.claims.find(c => c.id === 'target-1')).toMatchObject({
        unreadCount: 2,
        lastMessage: 'selected-message',
      });
    }
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps selected claim in the final capped list when selected claim is older', async () => {
    const tx = createTx();
    runActionWithTx(tx);
    const pageRows = Array.from({ length: 100 }, (_, index) =>
      claimRow(`visible-${index + 1}`, `u-${index + 1}`, new Date(2026, 0, 1, 0, index + 1))
    );
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([
      ...pageRows.map(row => ({ memberId: row.userId })),
      { memberId: 'u-target' },
    ]);
    tx.query.claims.findMany
      .mockResolvedValueOnce(pageRows)
      .mockResolvedValueOnce([claimRow('target-older', 'u-target', new Date(2025, 0, 1))]);
    tx.groupBy.mockResolvedValueOnce([]);
    tx.orderBy.mockResolvedValueOnce([]);

    const result = await callCore({
      ...baseParams,
      selectedClaimId: 'target-older',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toHaveLength(100);
      expect(result.claims.map(c => c.id)).toContain('target-older');
    }
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not inject selected claim when the member is outside the agent assignment scope', async () => {
    const tx = createTx();
    runActionWithTx(tx);
    tx.query.user.findFirst.mockResolvedValue({ branchId: 'branch-1' });
    tx.query.agentClients.findMany.mockResolvedValue([{ memberId: 'u1' }]);
    tx.query.claims.findMany
      .mockResolvedValueOnce([claimRow('visible-1', 'u1')])
      .mockResolvedValueOnce([]);
    tx.groupBy.mockResolvedValueOnce([{ claimId: 'visible-1', count: 0 }]);
    tx.orderBy.mockResolvedValueOnce([{ claimId: 'visible-1', content: 'hello' }]);

    const result = await callCore({
      ...baseParams,
      selectedClaimId: 'target-2',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.map(c => c.id)).toEqual(['visible-1']);
    }
    expect(tx.query.claims.findMany).toHaveBeenCalledTimes(2);
  });
});
