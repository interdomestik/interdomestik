// v2.0.0-ops — Admin Claims lifecycle hardening
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingTenantError } from '@interdomestik/shared-auth';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  enforceRateLimit: vi.fn(),
  getClaimsListV2: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenant,
}));

const AUTHORIZED = {
  session: { user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' } },
  authority: { kind: 'session-authority' },
};

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('@/server/domains/claims', () => ({
  getClaimsListV2: hoisted.getClaimsListV2,
}));

vi.mock('@sentry/nextjs', () => ({
  setTag: hoisted.setTag,
}));

describe('GET /api/claims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authorizeSessionTenant.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/claims');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ success: false, error: 'Unauthorized' });
    expect(hoisted.getClaimsListV2).not.toHaveBeenCalled();
  });

  it('returns 401 when the session has no tenant', async () => {
    hoisted.authorizeSessionTenant.mockRejectedValue(new MissingTenantError());

    const response = await GET(new Request('http://localhost:3000/api/claims'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(hoisted.getClaimsListV2).not.toHaveBeenCalled();
  });

  it('does not report a session lookup failure as a denial', async () => {
    hoisted.authorizeSessionTenant.mockRejectedValue(new Error('auth store unavailable'));

    await expect(GET(new Request('http://localhost:3000/api/claims'))).rejects.toThrow(
      'auth store unavailable'
    );
    expect(hoisted.getClaimsListV2).not.toHaveBeenCalled();
  });

  it('resolves the session authority from the request headers', async () => {
    hoisted.authorizeSessionTenant.mockResolvedValue(AUTHORIZED);
    hoisted.getClaimsListV2.mockResolvedValue({
      rows: [],
      totals: { active: 0, draft: 0, closed: 0 },
      pagination: { page: 1, perPage: 10, totalCount: 0, totalPages: 0 },
    });
    const request = new Request('http://localhost:3000/api/claims', {
      headers: { cookie: 'session=abc' },
    });

    await GET(request);

    expect(hoisted.authorizeSessionTenant).toHaveBeenCalledWith(request.headers);
  });

  it('returns claims list with ISO dates', async () => {
    hoisted.authorizeSessionTenant.mockResolvedValue(AUTHORIZED);

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
    expect(hoisted.getClaimsListV2).toHaveBeenCalledWith(AUTHORIZED, {
      page: 1,
      perPage: 10,
      statusFilter: 'active',
      search: 'alpha',
    });
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
    expect(hoisted.setTag).toHaveBeenCalledWith('slo_alert', 'd07.api.claims.latency');
  });

  it('returns 500 when domain throws', async () => {
    hoisted.authorizeSessionTenant.mockResolvedValue(AUTHORIZED);
    hoisted.getClaimsListV2.mockRejectedValue(new Error('Boom'));

    const request = new Request('http://localhost:3000/api/claims');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ success: false, error: 'Boom' });
  });
});
