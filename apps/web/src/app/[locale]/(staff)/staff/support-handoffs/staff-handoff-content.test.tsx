import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';

const mocks = vi.hoisted(() => ({ queue: vi.fn(), branch: vi.fn(), shell: vi.fn() }));
vi.mock('@/components/shell/session', () => ({ getSessionSafe: mocks.shell }));
vi.mock('@/lib/support-handoffs/staff-session', () => ({
  resolveStaffSupportSessionBranch: mocks.branch,
}));
vi.mock('@interdomestik/domain-claims/support-handoffs/queue', () => ({
  getStaffSupportHandoffQueue: mocks.queue,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('./staff-handoff-content-filters', () => ({ StaffHandoffContentFilters: () => null }));
vi.mock('./staff-handoff-content-row', () => ({ StaffHandoffContentRow: () => null }));
import Content from './staff-handoff-content';

const props = {
  params: Promise.resolve({ locale: 'en' }),
  searchParams: Promise.resolve({ assigned: 'mine' }),
};
const authorityFor = (role: string, accessTenantId = 'tenant-a') =>
  mintTenantAuthority({
    tenantId: 'tenant-a',
    accessTenantId,
    purpose: 'session',
    principal: { userId: 'fresh-user', role, branchId: 'fresh-branch', agentId: null },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queue.mockResolvedValue([]);
  mocks.branch.mockImplementation(session => Promise.resolve(session));
});
describe('fresh-authority staff content reader', () => {
  it('takes identity, role, branch and assignment from fresh authority with a stale BM shell session', async () => {
    mocks.shell.mockResolvedValue({
      user: { id: 'old-user', role: 'branch_manager', branchId: 'old-branch' },
    });
    const authority = authorityFor('staff');
    await Content({ ...props, authority });
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        authority,
        staffId: 'fresh-user',
        branchId: 'fresh-branch',
        viewerRole: 'staff',
        assignment: 'mine',
      })
    );
    expect(mocks.shell).not.toHaveBeenCalled();
  });
  it.each([
    'branch_manager',
    'tenant_admin',
    'admin',
    'super_admin',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('refuses direct %s content entry before the frozen reader', async role => {
    mocks.shell.mockResolvedValue({ user: { id: 'old-user', role: 'staff' } });
    await expect(Content({ ...props, authority: authorityFor(role) })).rejects.toThrow('notFound');
    expect(mocks.branch).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('refuses mismatched access tenants and branchless staff', async () => {
    await expect(
      Content({ ...props, authority: authorityFor('staff', 'tenant-b') })
    ).rejects.toThrow('notFound');
    mocks.branch.mockResolvedValue(null);
    await expect(Content({ ...props, authority: authorityFor('staff') })).rejects.toThrow(
      'notFound'
    );
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
