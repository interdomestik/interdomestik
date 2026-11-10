import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';
const mocks = vi.hoisted(() => ({ session: vi.fn(), authority: vi.fn(), staff: vi.fn() }));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.session,
  requireSessionOrRedirect: (session: unknown) => {
    if (!session) throw new Error('redirect:login');
    return session;
  },
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authority }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('./staff-handoff-content', () => ({ default: mocks.staff }));
vi.mock('@/features/claims/support-handoffs/branch-manager-handoffs', () => ({
  BranchManagerHandoffs: () => null,
}));
import { BranchManagerHandoffs } from '@/features/claims/support-handoffs/branch-manager-handoffs';
import Page from './page';
const props = { params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) };
function authorize(role: string) {
  const authority = mintTenantAuthority({
    tenantId: 'tenant-a',
    purpose: 'session',
    principal: { userId: 'viewer', role, branchId: 'branch-a', agentId: null },
  });
  mocks.authority.mockResolvedValue({ session: { user: { id: 'viewer', role } }, authority });
  return authority;
}
beforeEach(() => vi.clearAllMocks());
describe('handoff page fresh-authority dispatch', () => {
  it('uses fresh BM authority when the shell still caches staff: metadata only, no content reader', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'staff' } });
    const authority = authorize('branch_manager');
    mocks.staff.mockResolvedValue('SUBJECT-MESSAGE-CONTENT-SENTINEL');
    const element = await Page(props);
    expect(element).toMatchObject({ type: BranchManagerHandoffs, props: { authority } });
    expect(JSON.stringify(element)).not.toContain('SENTINEL');
    expect(mocks.staff).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.authority).toHaveBeenCalledExactlyOnceWith();
  });
  it.each([
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('sends fresh %s authority to content admission, ignoring the cached BM role', async role => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'branch_manager' } });
    authorize(role);
    mocks.staff.mockResolvedValue('original');
    expect(await Page(props)).toBe('original');
    expect(mocks.staff).toHaveBeenCalledExactlyOnceWith({
      ...props,
      authority: expect.anything(),
    });
    expect(mocks.authority).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('does not enter either reader when fresh authentication is absent', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'staff' } });
    mocks.authority.mockResolvedValue(null);
    await expect(Page(props)).rejects.toThrow('redirect:login');
    expect(mocks.staff).not.toHaveBeenCalled();
  });
});
