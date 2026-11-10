import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  cachedSession: vi.fn(),
  freshSession: vi.fn(),
  headers: vi.fn(),
  core: vi.fn(),
}));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.session,
  requireSessionOrRedirect: (session: unknown) => {
    if (!session) throw new Error('redirect:login');
    return session;
  },
}));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: mocks.cachedSession }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.freshSession } } }));
vi.mock('@/lib/tenant-authority.server', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/tenant-authority.server')>();
  return { ...actual, authorizeSessionTenant: vi.fn(actual.authorizeSessionTenant) };
});
vi.mock('next/headers', () => ({ headers: mocks.headers }));
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
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import Page from './page';

const props = { params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) };
const view = <div>HANDOFF-SUBJECT-SENTINEL HANDOFF-MESSAGE-SENTINEL</div>;
const requestHeaders = new Headers({ cookie: 'better-auth.session_token=test-session' });

function session(role: string, userId = 'viewer', tenantId: string | null = 'tenant-a') {
  return { user: { id: userId, role, tenantId, branchId: 'branch-a', agentId: null } };
}

function cacheSession(value: ReturnType<typeof session> | null) {
  // Every no-header lookup receives the same request snapshot, including during core reads.
  mocks.cachedSession.mockReturnValue(Promise.resolve(value));
}

function expectFreshCheck() {
  expect(authorizeSessionTenant).toHaveBeenCalledTimes(2);
  expect(authorizeSessionTenant).toHaveBeenNthCalledWith(1);
  expect(authorizeSessionTenant).toHaveBeenNthCalledWith(2, requestHeaders);
  expect(requestHeaders).toBeInstanceOf(Headers);
  expect(mocks.cachedSession).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.headers).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.freshSession).toHaveBeenCalledExactlyOnceWith({ headers: requestHeaders });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  cacheSession(session('staff'));
  mocks.freshSession.mockResolvedValue(session('staff'));
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.core.mockResolvedValue(view);
});

describe('handoff page fresh-authority dispatch', () => {
  it('uses BM authority when the shell caches staff without calling the core', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'staff' } });
    cacheSession(session('branch_manager'));
    const element = await Page(props);
    expect(element.type).toBe(BranchManagerHandoffs);
    expect(readTenantAuthority(element.props.authority).principal?.role).toBe('branch_manager');
    expect(renderToStaticMarkup(element)).not.toContain('SENTINEL');
    expect(mocks.core).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(authorizeSessionTenant).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.freshSession).not.toHaveBeenCalled();
  });

  it('discards rendered content when the uncached second read becomes BM', async () => {
    // A repeated no-header authorization would still see staff after this role change.
    mocks.core.mockImplementationOnce(() => {
      mocks.freshSession.mockResolvedValue(session('branch_manager'));
      return Promise.resolve(view);
    });
    const element = await Page(props);
    expect(element.type).toBe(BranchManagerHandoffs);
    expect(readTenantAuthority(element.props.authority).principal?.role).toBe('branch_manager');
    const html = renderToStaticMarkup(element);
    expect(html).toContain('BM metadata');
    expect(html).not.toContain('HANDOFF-SUBJECT-SENTINEL');
    expect(html).not.toContain('HANDOFF-MESSAGE-SENTINEL');
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith(props);
    expectFreshCheck();
    expect(mocks.core.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(authorizeSessionTenant).mock.invocationCallOrder[0]
    );
    expect(vi.mocked(authorizeSessionTenant).mock.invocationCallOrder[1]).toBeGreaterThan(
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
  ])('returns exactly the original element for %s on both reads', async role => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'branch_manager' } });
    cacheSession(session(role));
    mocks.freshSession.mockResolvedValue(session(role));
    expect(await Page(props)).toBe(view);
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith(props);
    expectFreshCheck();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([
    ['different user', session('staff', 'other-user')],
    ['different tenant', session('staff', 'viewer', 'tenant-b')],
    ['different user now BM', session('branch_manager', 'other-user')],
    ['different tenant now BM', session('branch_manager', 'viewer', 'tenant-b')],
    ['no session (revoked)', null],
  ])('returns notFound when the second read has %s', async (_label, current) => {
    mocks.core.mockImplementationOnce(() => {
      mocks.freshSession.mockResolvedValue(current);
      return Promise.resolve(view);
    });
    await expect(Page(props)).rejects.toThrow('notFound');
    expect(mocks.core).toHaveBeenCalledExactlyOnceWith(props);
    expectFreshCheck();
  });

  it.each(['first', 'second'])('returns notFound for a tenantless %s check', async check => {
    const tenantless = session('staff', 'viewer', null);
    if (check === 'first') cacheSession(tenantless);
    else mocks.freshSession.mockResolvedValue(tenantless);
    await expect(Page(props)).rejects.toThrow('notFound');
    if (check === 'first') {
      expect(authorizeSessionTenant).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.core).not.toHaveBeenCalled();
      expect(mocks.freshSession).not.toHaveBeenCalled();
    } else {
      expectFreshCheck();
    }
  });

  it.each(['first', 'second'])('rethrows unrelated errors from the %s check', async check => {
    const error = new Error('session store unavailable');
    if (check === 'first') mocks.cachedSession.mockRejectedValue(error);
    else mocks.freshSession.mockRejectedValue(error);
    await expect(Page(props)).rejects.toBe(error);
    if (check === 'first') expect(mocks.core).not.toHaveBeenCalled();
    else expectFreshCheck();
  });

  it('does not enter either reader when authentication is absent', async () => {
    cacheSession(null);
    await expect(Page(props)).rejects.toThrow('redirect:login');
    expect(authorizeSessionTenant).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.core).not.toHaveBeenCalled();
    expect(mocks.freshSession).not.toHaveBeenCalled();
  });
});
