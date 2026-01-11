// v2.0.0-ops — Admin Claims lifecycle hardening
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  getClaimsListV2: vi.fn(),
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

vi.mock('@/server/domains/claims', () => ({
  getClaimsListV2: hoisted.getClaimsListV2,
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

  it('returns claims list with ISO dates', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    const updatedAt = new Date('2025-01-02T00:00:00.000Z');
    hoisted.getClaimsListV2.mockResolvedValue({
      rows: [
        {
          id: 'claim-1',
          title: 'T',
          status: 'submitted',
          statusLabelKey: 'claims.status.submitted',
          currentStage: 'submitted',
          currentOwnerRole: 'staff',
          isStuck: false,
          daysInCurrentStage: 2,
          claimantName: 'Name',
          claimantEmail: 'Email',
          branchId: 'branch-1',
          branchCode: 'BR-01',
          branchName: 'Branch',
          staffName: 'Staff Name',
          staffEmail: 'staff@example.com',
          assignedAt: null,
          amount: '10',
          currency: 'USD',
          createdAt,
          updatedAt,
          unreadCount: 2,
          category: 'cat',
        },
      ],
      totals: { active: 1, draft: 0, closed: 0 },
      pagination: { page: 1, perPage: 10, totalCount: 1, totalPages: 1 },
    });

    const request = new Request(
      'http://localhost:3000/api/claims?page=1&status=active&search=alpha'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(hoisted.getClaimsListV2).toHaveBeenCalledWith(
      { user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' } },
      { page: 1, perPage: 10, statusFilter: 'active', search: 'alpha' }
    );
    expect(data).toEqual({
      success: true,
      claims: [
        {
          id: 'claim-1',
          title: 'T',
          status: 'submitted',
          statusLabelKey: 'claims.status.submitted',
          currentStage: 'submitted',
          currentOwnerRole: 'staff',
          isStuck: false,
          daysInCurrentStage: 2,
          claimantName: 'Name',
          claimantEmail: 'Email',
          branchId: 'branch-1',
          branchCode: 'BR-01',
          branchName: 'Branch',
          staffName: 'Staff Name',
          staffEmail: 'staff@example.com',
          assignedAt: null,
          amount: '10',
          currency: 'USD',
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          category: 'cat',
          unreadCount: 2,
        },
      ],
      page: 1,
      perPage: 10,
      totalCount: 1,
      totalPages: 1,
      totals: { active: 1, draft: 0, closed: 0 },
    });
  });

  it('returns 500 when domain throws', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    hoisted.getClaimsListV2.mockRejectedValue(new Error('Boom'));

    const request = new Request('http://localhost:3000/api/claims');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ success: false, error: 'Boom' });
  });
});
