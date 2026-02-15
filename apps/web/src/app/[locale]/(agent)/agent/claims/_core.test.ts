import { describe, expect, it, vi } from 'vitest';
import { buildAgentWorkspaceClaimHref, getAgentClaimsCore } from './_core';

describe('getAgentClaimsCore', () => {
  function createMockParams() {
    const selectWhere = vi.fn();
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const select = vi.fn(() => ({ from: selectFrom }));

    return {
      tenantId: 'tenant-1',
      userId: 'agent-1',
      role: 'agent',
      db: {
        query: {
          user: {
            findMany: vi.fn(),
          },
          claims: {
            findMany: vi.fn(),
          },
        },
        select,
      },
      mocks: {
        selectWhere,
      },
    };
  }

  it('returns forbidden for non-agent role', async () => {
    const mockParams = createMockParams();
    const result = await getAgentClaimsCore({ ...mockParams, role: 'member' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('FORBIDDEN');
    }
  });

  it('returns empty array if no members found', async () => {
    const mockParams = createMockParams();
    mockParams.db.query.user.findMany.mockResolvedValue([]);
    mockParams.mocks.selectWhere.mockResolvedValue([]);

    const result = await getAgentClaimsCore(mockParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('groups claims by member correctly', async () => {
    const mockParams = createMockParams();
    const mockMembers = [
      { id: 'm1', name: 'Member 1', email: 'm1@test.com' },
      { id: 'm2', name: 'Member 2', email: 'm2@test.com' },
    ];
    const mockClaims = [
      { id: 'c1', userId: 'm1', title: 'Claim 1', status: 'submitted', createdAt: new Date() },
      { id: 'c2', userId: 'm1', title: 'Claim 2', status: 'evaluation', createdAt: new Date() },
    ];

    mockParams.db.query.user.findMany.mockResolvedValue(mockMembers);
    mockParams.mocks.selectWhere.mockResolvedValue([]);
    mockParams.db.query.claims.findMany.mockResolvedValue(mockClaims);

    const result = await getAgentClaimsCore(mockParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1); // Only member 1 has claims
      expect(result.data[0].memberId).toBe('m1');
      expect(result.data[0].claims.length).toBe(2);
    }
  });

  it('includes claims for members linked via active agent_clients relation', async () => {
    const mockParams = createMockParams();
    mockParams.db.query.user.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'm3', name: 'Member 3', email: 'm3@test.com' }]);
    mockParams.mocks.selectWhere.mockResolvedValue([{ memberId: 'm3' }]);
    mockParams.db.query.claims.findMany.mockResolvedValue([
      { id: 'c3', userId: 'm3', title: 'Claim 3', status: 'submitted', createdAt: new Date() },
    ]);

    const result = await getAgentClaimsCore(mockParams);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        expect.objectContaining({
          memberId: 'm3',
          claims: [expect.objectContaining({ id: 'c3' })],
        }),
      ]);
    }
    expect(mockParams.db.query.user.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('buildAgentWorkspaceClaimHref', () => {
  it('builds locale-agnostic workspace claim deep-link with claimId query param', () => {
    expect(buildAgentWorkspaceClaimHref('claim-123')).toBe(
      '/agent/workspace/claims?claimId=claim-123'
    );
  });
});
