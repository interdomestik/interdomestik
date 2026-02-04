import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAssignment: vi.fn(),
  findClaims: vi.fn(),
  eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  desc: vi.fn(value => ({ value, op: 'desc' })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      agentClients: { findFirst: mocks.findAssignment },
      claims: { findMany: mocks.findClaims },
    },
  },
  agentClients: {
    tenantId: 'agent_clients.tenant_id',
    agentId: 'agent_clients.agent_id',
    memberId: 'agent_clients.member_id',
  },
  claims: {
    tenantId: 'claims.tenant_id',
    userId: 'claims.user_id',
    updatedAt: 'claims.updated_at',
  },
  eq: mocks.eq,
  and: mocks.and,
  desc: mocks.desc,
}));

import { getAgentMemberDetail } from './get-agent-member-detail';

describe('getAgentMemberDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns member detail with recent claims when assigned', async () => {
    mocks.findAssignment.mockResolvedValue({
      member: { id: 'member-1', name: 'Member One', memberNumber: 'MEM-1' },
    });
    mocks.findClaims.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'CLM-1',
        status: 'submitted',
        updatedAt: new Date('2026-01-10T00:00:00Z'),
      },
    ]);

    const result = await getAgentMemberDetail({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      memberId: 'member-1',
    });

    expect(result?.member.fullName).toBe('Member One');
    expect(result?.member.membershipNumber).toBe('MEM-1');
    expect(result?.recentClaims).toHaveLength(1);
    expect(result?.recentClaims[0].stageLabel).toBe('Submitted');
  });

  it('returns null when agent does not own the member', async () => {
    mocks.findAssignment.mockResolvedValue(null);

    const result = await getAgentMemberDetail({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      memberId: 'member-2',
    });

    expect(result).toBeNull();
    expect(mocks.findClaims).not.toHaveBeenCalled();
  });

  it('enforces tenant isolation', async () => {
    mocks.findAssignment.mockResolvedValue(null);

    await getAgentMemberDetail({
      agentId: 'agent-2',
      tenantId: 'tenant-2',
      memberId: 'member-3',
    });

    expect(mocks.eq).toHaveBeenCalledWith('agent_clients.tenant_id', 'tenant-2');
  });
});
