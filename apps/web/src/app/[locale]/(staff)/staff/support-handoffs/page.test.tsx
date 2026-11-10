import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({ session: vi.fn(), authority: vi.fn(), core: vi.fn() }));
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
vi.mock('./_core.entry', () => ({
  default: mocks.core,
  generateMetadata: vi.fn(),
  generateViewport: vi.fn(),
}));
vi.mock('@/features/claims/support-handoffs/branch-manager-handoffs', () => ({
  BranchManagerHandoffs: () => <div>BM metadata</div>,
}));
import { BranchManagerHandoffs } from '@/features/claims/support-handoffs/branch-manager-handoffs';
import Page from './page';

const props = { params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) };
const view = <div>HANDOFF-SUBJECT-SENTINEL HANDOFF-MESSAGE-SENTINEL</div>;

function authorized(role: string, userId = 'viewer', tenantId = 'tenant-a') {
  const authority = mintTenantAuthority({
    tenantId,
    purpose: 'session',
    principal: { userId, role, branchId: 'branch-a', agentId: null },
  });
  return { session: { user: { id: userId, role, tenantId } }, authority };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.core.mockResolvedValue(view);
});

describe('handoff page fresh-authority dispatch', () => {
  it('uses fresh BM authority when the shell caches staff without calling the core', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'staff' } });
    const current = authorized('branch_manager');
    mocks.authority.mockResolvedValue(current);
    const element = await Page(props);
    expect(element).toMatchObject({
      type: BranchManagerHandoffs,
      props: { authority: current.authority },
    });
    expect(renderToStaticMarkup(element)).not.toContain('SENTINEL');
    expect(mocks.core).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.authority).toHaveBeenCalledExactlyOnceWith();
  });

  it('discards rendered content when the second fresh read becomes BM', async () => {
    const current = authorized('branch_manager');
    mocks.authority.mockResolvedValueOnce(authorized('staff')).mockResolvedValueOnce(current);
    const element = await Page(props);
    expect(element).toMatchObject({
      type: BranchManagerHandoffs,
      props: { authority: current.authority },
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('BM metadata');
    expect(html).not.toContain('HANDOFF-SUBJECT-SENTINEL');
    expect(html).not.toContain('HANDOFF-MESSAGE-SENTINEL');
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith(props);
    expect(mocks.authority).toHaveBeenCalledTimes(2);
    expect(mocks.core.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.authority.mock.invocationCallOrder[0]
    );
    expect(mocks.authority.mock.invocationCallOrder[1]).toBeGreaterThan(
      mocks.core.mock.invocationCallOrder[0]
    );
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
  ])('returns exactly the original element for fresh %s on both reads', async role => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'branch_manager' } });
    mocks.authority.mockResolvedValue(authorized(role));
    expect(await Page(props)).toBe(view);
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith(props);
    expect(mocks.authority).toHaveBeenCalledTimes(2);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([
    ['different user', authorized('staff', 'other-user')],
    ['different tenant', authorized('staff', 'viewer', 'tenant-b')],
    ['different user now BM', authorized('branch_manager', 'other-user')],
    ['different tenant now BM', authorized('branch_manager', 'viewer', 'tenant-b')],
    ['no session', null],
  ])('returns notFound when the second read has %s', async (_label, current) => {
    mocks.authority.mockResolvedValueOnce(authorized('staff')).mockResolvedValueOnce(current);
    await expect(Page(props)).rejects.toThrow('notFound');
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith(props);
    expect(mocks.authority).toHaveBeenCalledTimes(2);
  });

  it('does not enter either reader when fresh authentication is absent', async () => {
    mocks.authority.mockResolvedValue(null);
    await expect(Page(props)).rejects.toThrow('redirect:login');
    expect(mocks.core).not.toHaveBeenCalled();
  });
});
