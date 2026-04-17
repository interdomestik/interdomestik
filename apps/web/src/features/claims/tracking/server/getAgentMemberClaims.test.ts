import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  ensureClaimsAccess: vi.fn(),
  setTag: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback()
  ),
  buildClaimVisibilityWhere: vi.fn(),
  findManyUsers: vi.fn(),
  selectWhere: vi.fn(),
  findManyClaims: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
  ne: vi.fn((left: unknown, right: unknown) => ({ op: 'ne', left, right })),
  desc: vi.fn((value: unknown) => ({ op: 'desc', value })),
}));

vi.mock('../../../../server/domains/claims/guards', () => ({
  ensureClaimsAccess: hoisted.ensureClaimsAccess,
}));
vi.mock('@sentry/nextjs', () => ({
  setTag: hoisted.setTag,
  withServerActionInstrumentation: hoisted.withServerActionInstrumentation,
}));
vi.mock('../utils', () => ({
  buildClaimVisibilityWhere: hoisted.buildClaimVisibilityWhere,
}));
vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findMany: hoisted.findManyUsers,
      },
      claims: {
        findMany: hoisted.findManyClaims,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: hoisted.selectWhere,
      })),
    })),
  },
}));
vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    userId: 'claims.userId',
    status: 'claims.status',
    updatedAt: 'claims.updatedAt',
  },
  user: {
    tenantId: 'user.tenantId',
    agentId: 'user.agentId',
    id: 'user.id',
  },
  agentClients: {
    memberId: 'agentClients.memberId',
    tenantId: 'agentClients.tenantId',
    agentId: 'agentClients.agentId',
    status: 'agentClients.status',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  desc: hoisted.desc,
  eq: hoisted.eq,
  inArray: hoisted.inArray,
  ne: hoisted.ne,
}));

import { getAgentMemberClaims } from './getAgentMemberClaims';

describe('getAgentMemberClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.ensureClaimsAccess.mockReturnValue({
      tenantId: 'tenant-1',
      userId: 'agent-1',
      role: 'agent',
      branchId: 'branch-1',
    });
    hoisted.buildClaimVisibilityWhere.mockReturnValue({ op: 'visibility' });
    hoisted.findManyUsers.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'member-2',
        name: 'Member Two',
        email: 'member2@example.com',
      },
    ]);
    hoisted.selectWhere.mockResolvedValue([{ memberId: 'member-2' }]);
    hoisted.findManyClaims.mockResolvedValue([
      {
        id: 'claim-2',
        title: 'Claim Two',
        status: 'submitted',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
        userId: 'member-2',
      },
    ]);
  });

  it('includes members linked through active agent_clients when user.agentId is empty', async () => {
    const result = await getAgentMemberClaims({
      user: { id: 'agent-1', role: 'agent', branchId: 'branch-1', tenantId: 'tenant-1' },
    });

    expect(result).toEqual([
      {
        memberId: 'member-2',
        memberName: 'Member Two',
        memberEmail: 'member2@example.com',
        claims: [
          {
            id: 'claim-2',
            title: 'Claim Two',
            status: 'submitted',
            statusLabelKey: 'claims-tracking.status.submitted',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-02T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(hoisted.buildClaimVisibilityWhere).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'agent-1',
      role: 'agent',
      branchId: 'branch-1',
      agentMemberIds: ['member-2'],
    });
  });
});
