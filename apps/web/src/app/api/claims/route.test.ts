import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

function createCountChain(total: number) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ total }]),
  };
}

function createRowsChain<T extends Record<string, unknown>>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
}

function createUnreadChain(unreadRows: Array<{ claimId: string; total: number }>) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(unreadRows),
  };
}

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoisted.dbSelect,
  },
  and: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  ne: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  claims: {
    id: 'claims.id',
    userId: 'claims.userId',
    tenantId: 'claims.tenantId',
    staffId: 'claims.staffId',
    status: 'claims.status',
    title: 'claims.title',
    companyName: 'claims.companyName',
    claimAmount: 'claims.claimAmount',
    currency: 'claims.currency',
    category: 'claims.category',
    createdAt: 'claims.createdAt',
  },
  user: {
    id: 'user.id',
    agentId: 'user.agentId',
    name: 'user.name',
    email: 'user.email',
  },
  claimMessages: {
    claimId: 'claimMessages.claimId',
    readAt: 'claimMessages.readAt',
    senderId: 'claimMessages.senderId',
  },
}));

vi.mock('@interdomestik/database/constants', () => ({
  CLAIM_STATUSES: ['draft', 'submitted', 'approved'],
}));

vi.mock('drizzle-orm', () => ({
  count: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
}));

describe('GET /api/claims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/claims');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 403 when unauthorized scope is requested', async () => {
    hoisted.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });

    const request = new Request('http://localhost:3000/api/claims?scope=admin');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns claims for member scope by default', async () => {
    hoisted.getSession.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });

    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    hoisted.dbSelect.mockReturnValueOnce(createCountChain(1)).mockReturnValueOnce(
      createRowsChain([
        {
          id: 'claim-1',
          title: 'T',
          status: 'submitted',
          createdAt,
          companyName: 'C',
          claimAmount: '10',
          currency: 'USD',
          category: 'cat',
          claimantName: 'Name',
          claimantEmail: 'Email',
        },
      ])
    );

    const request = new Request('http://localhost:3000/api/claims');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      claims: [
        {
          id: 'claim-1',
          title: 'T',
          status: 'submitted',
          createdAt: createdAt.toISOString(),
          companyName: 'C',
          claimAmount: '10',
          currency: 'USD',
          category: 'cat',
          claimantName: 'Name',
          claimantEmail: 'Email',
          unreadCount: 0,
        },
      ],
      page: 1,
      perPage: 10,
      totalCount: 1,
      totalPages: 1,
    });
  });

  it('redacts fields for agent queue when agent', async () => {
    hoisted.getSession.mockResolvedValue({ user: { id: 'agent-1', role: 'agent' } });

    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    hoisted.dbSelect
      .mockReturnValueOnce(createCountChain(1))
      .mockReturnValueOnce(
        createRowsChain([
          {
            id: 'claim-1',
            title: 'Sensitive',
            status: 'submitted',
            createdAt,
            companyName: 'Secret',
            claimAmount: '10',
            currency: 'USD',
            category: 'cat',
            claimantName: 'Name',
            claimantEmail: 'Email',
          },
        ])
      )
      .mockReturnValueOnce(createUnreadChain([{ claimId: 'claim-1', total: 2 }]))
      .mockClear();

    // Re-apply in order (mockClear resets history, not implementations)
    hoisted.dbSelect
      .mockReturnValueOnce(createCountChain(1))
      .mockReturnValueOnce(
        createRowsChain([
          {
            id: 'claim-1',
            title: 'Sensitive',
            status: 'submitted',
            createdAt,
            companyName: 'Secret',
            claimAmount: '10',
            currency: 'USD',
            category: 'cat',
            claimantName: 'Name',
            claimantEmail: 'Email',
          },
        ])
      )
      .mockReturnValueOnce(createUnreadChain([{ claimId: 'claim-1', total: 2 }]));

    const request = new Request('http://localhost:3000/api/claims?scope=agent_queue');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.claims[0]).toEqual(
      expect.objectContaining({
        id: 'claim-1',
        title: null,
        companyName: null,
        claimAmount: null,
        currency: null,
        category: null,
        claimantName: null,
        claimantEmail: null,
        unreadCount: 0,
      })
    );
  });
});
