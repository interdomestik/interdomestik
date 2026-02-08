import { describe, expect, it, vi } from 'vitest';
import { buildAgentWorkspaceClaimHref, getAgentClaimsCore } from './_core';

describe('getAgentClaimsCore', () => {
  const mockParams = {
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
    },
  };

  it('returns forbidden for non-agent role', async () => {
    const result = await getAgentClaimsCore({ ...mockParams, role: 'member' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('FORBIDDEN');
    }
  });

  it('returns empty array if no members found', async () => {
    mockParams.db.query.user.findMany.mockResolvedValue([]);
    const result = await getAgentClaimsCore(mockParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('groups claims by member correctly', async () => {
    const mockMembers = [
      { id: 'm1', name: 'Member 1', email: 'm1@test.com' },
      { id: 'm2', name: 'Member 2', email: 'm2@test.com' },
    ];
    const mockClaims = [
      { id: 'c1', userId: 'm1', title: 'Claim 1', status: 'submitted', createdAt: new Date() },
      { id: 'c2', userId: 'm1', title: 'Claim 2', status: 'evaluation', createdAt: new Date() },
    ];

    mockParams.db.query.user.findMany.mockResolvedValue(mockMembers);
    mockParams.db.query.claims.findMany.mockResolvedValue(mockClaims);

    const result = await getAgentClaimsCore(mockParams);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1); // Only member 1 has claims
      expect(result.data[0].memberId).toBe('m1');
      expect(result.data[0].claims.length).toBe(2);
    }
  });
});

describe('buildAgentWorkspaceClaimHref', () => {
  it('builds locale-agnostic workspace claim deep-link with claimId query param', () => {
    expect(buildAgentWorkspaceClaimHref('claim-123')).toBe(
      '/agent/workspace/claims?claimId=claim-123'
    );
  });
});
