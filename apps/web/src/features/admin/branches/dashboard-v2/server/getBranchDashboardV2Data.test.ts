import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  getActionContextMock: vi.fn(),
  scopeFilterMock: vi.fn(),
}));

vi.mock('@/actions/admin-users/context', () => ({
  getActionContext: hoisted.getActionContextMock,
}));
vi.mock('@/features/admin/branches/server/branch-cash-metrics', () => ({
  getBranchCashPendingByAgent: vi.fn(),
  getBranchCashPendingCount: vi.fn(),
}));
vi.mock('@interdomestik/database/db', () => ({ db: {} }));
vi.mock('@interdomestik/shared-auth', () => ({
  ROLES: { agent: 'agent', branch_manager: 'branch_manager' },
  scopeFilter: hoisted.scopeFilterMock,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, action: () => Promise<unknown>) => action()
  ),
}));

import { getBranchDashboardV2Data } from './getBranchDashboardV2Data';

describe('getBranchDashboardV2Data branch-manager guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, null, '', '   ', 'branch-b'])(
    'returns null before database access for an unusable or mismatched assignment (%j)',
    async branchId => {
      hoisted.getActionContextMock.mockResolvedValue({
        session: {
          user: {
            role: 'branch_manager',
            branchId,
            tenantId: 'tenant-a',
          },
        },
      });

      await expect(getBranchDashboardV2Data('branch-a')).resolves.toBeNull();
      expect(hoisted.scopeFilterMock).not.toHaveBeenCalled();
      expect(hoisted.captureExceptionMock).not.toHaveBeenCalled();
    }
  );
});
