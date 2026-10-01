import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.session } } }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/server/domains/claims/list-query', () => ({ getTenantSafeClaimsListQuery: h.query }));
vi.mock('@sentry/nextjs', () => ({
  setTag: vi.fn(),
  captureException: vi.fn(),
  withServerActionInstrumentation: (_name: string, _options: unknown, run: () => unknown) => run(),
}));
import { GET } from './route';

// Exercise the real domain mapper and API serializer, not a pre-sanitized DTO mock.
describe('claims API role projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.query.mockResolvedValue({
      rows: [
        {
          claim: {
            id: 'owned',
            title: 'Owned case',
            status: 'submitted',
            currency: 'EUR',
            createdAt: null,
            updatedAt: null,
          },
          claimant: { name: 'Member', email: 'member@example.test' },
          staff: { name: 'Internal staff', email: 'staff@example.test' },
          branch: { id: 'branch-private', code: 'BR-PRIVATE', name: 'Internal branch' },
          unreadCount: 0,
        },
      ],
      facets: { active: 1, draft: 0, closed: 0, total: 1 },
    });
  });

  it.each(['member', 'user', 'agent', 'unknown', undefined])(
    'minimizes operational data for %s',
    async role => {
      h.session.mockResolvedValue({ user: { id: 'member-1', tenantId: 'tenant-ks', role } });
      const response = await GET(new Request('http://localhost/api/claims?scope=admin'));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.claims[0]).toMatchObject({
        id: 'owned',
        title: 'Owned case',
        staffEmail: null,
        staffName: null,
        branchId: null,
        branchCode: null,
        branchName: null,
      });
      expect(JSON.stringify(body)).not.toContain('staff@example.test');
      expect(JSON.stringify(body)).not.toContain('BR-PRIVATE');
      expect(body.totalCount).toBe(1);
    }
  );

  it.each(['staff', 'branch_manager', 'admin', 'tenant_admin', 'super_admin'])(
    'retains authorized operational data for %s',
    async role => {
      h.session.mockResolvedValue({ user: { id: 'operator-1', tenantId: 'tenant-ks', role } });
      const response = await GET(new Request('http://localhost/api/claims?scope=member'));
      expect(response.status).toBe(200);
      expect((await response.json()).claims[0]).toMatchObject({
        staffEmail: 'staff@example.test',
        staffName: 'Internal staff',
        branchId: 'branch-private',
        branchCode: 'BR-PRIVATE',
        branchName: 'Internal branch',
      });
    }
  );
});
