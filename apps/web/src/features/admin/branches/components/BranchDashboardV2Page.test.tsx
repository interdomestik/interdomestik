import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchDashboardV2Page } from './BranchDashboardV2Page';

type MockSession = {
  user: {
    role: string;
    branchId?: string | null;
  };
};

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn<() => Promise<MockSession>>(async () => ({
    user: { role: 'branch_manager', branchId: 'branch-a' },
  })),
  getBranchDashboardV2DataMock: vi.fn(),
  headersMock: vi.fn(async () => new Headers()),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: hoisted.getSessionMock } },
}));

vi.mock('@/features/admin/branches/dashboard-v2/server/getBranchDashboardV2Data', () => ({
  getBranchDashboardV2Data: hoisted.getBranchDashboardV2DataMock,
}));
vi.mock('@/features/admin/branches/dashboard-v2/components/BranchDashboardV2', () => ({
  BranchDashboardV2: vi.fn(() => null),
}));
vi.mock('@/i18n/routing', () => ({ Link: vi.fn(() => null) }));
vi.mock('@interdomestik/ui/components/button', () => ({ Button: vi.fn(() => null) }));
vi.mock('lucide-react', () => ({ ArrowLeft: vi.fn(() => null) }));

vi.mock('next/headers', () => ({ headers: hoisted.headersMock }));
vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
  redirect: hoisted.redirectMock,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

describe('BranchDashboardV2Page branch-manager guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, null, '', '   '])(
    'fails closed without a usable branch assignment (%j)',
    async branchId => {
      hoisted.getSessionMock.mockResolvedValue({
        user: { role: 'branch_manager', branchId },
      });

      await expect(BranchDashboardV2Page({ branchId: 'branch-a', locale: 'sq' })).rejects.toThrow(
        'NEXT_NOT_FOUND'
      );

      expect(hoisted.notFoundMock).toHaveBeenCalledOnce();
      expect(hoisted.redirectMock).not.toHaveBeenCalled();
      expect(hoisted.getBranchDashboardV2DataMock).not.toHaveBeenCalled();
    }
  );

  it('redirects a mismatched branch before querying branch data', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { role: 'branch_manager', branchId: 'assigned branch/a' },
    });

    await expect(BranchDashboardV2Page({ branchId: 'branch-b', locale: 'sq' })).rejects.toThrow(
      'NEXT_REDIRECT:/sq/admin/branches/assigned%20branch%2Fa'
    );

    expect(hoisted.getBranchDashboardV2DataMock).not.toHaveBeenCalled();
  });
});
