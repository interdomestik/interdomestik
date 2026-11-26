import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  getSessionMock: vi.fn<() => Promise<unknown>>(async () => null),
  authorizeSessionTenantMock: vi.fn(),
  getAgentLeadsCoreMock: vi.fn(),
  withTenantContextMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
  redirect: hoisted.redirectMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenantMock,
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContextMock,
}));

vi.mock('@/features/agent/leads/components/AgentLeadsProPage', () => ({
  AgentLeadsProPage: () => null,
}));

vi.mock('./_core', () => ({
  getAgentLeadsCore: hoisted.getAgentLeadsCoreMock,
}));

import AgentLeadsEntry from './_core.entry';
import AgentLeadsPage from './page';
import AgentWorkspaceLeadsPage from '../workspace/leads/page';

const authority = mintTestTenantAuthority('tenant-1');
const agentUser = { id: 'agent-1', role: 'agent', tenantId: 'tenant-1', branchId: 'branch-1' };

type Page = typeof AgentLeadsEntry;

function authorizeAs(user: Record<string, string | null | undefined> | null) {
  hoisted.authorizeSessionTenantMock.mockResolvedValue(
    user ? { session: { user }, authority } : null
  );
}

// Identity the request might carry; the page must never read it.
const injected = {
  locale: 'en',
  agentId: 'agent-2',
  branchId: 'branch-2',
  tenantId: 'tenant-2',
};

function render(page: Page) {
  const props = {
    params: Promise.resolve(injected),
    searchParams: Promise.resolve({ ...injected }),
  };
  return page(props as never);
}

function expectNoLeadRead() {
  expect(hoisted.getAgentLeadsCoreMock).not.toHaveBeenCalled();
  expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
}

describe('both leads pages are the agent leads entry', () => {
  it('renders the same function, so both URLs share one visibility rule', () => {
    expect(AgentLeadsPage).toBe(AgentLeadsEntry);
    expect(AgentWorkspaceLeadsPage).toBe(AgentLeadsEntry);
  });
});

describe.each([
  ['/agent/leads', AgentLeadsPage as Page],
  ['/agent/workspace/leads', AgentWorkspaceLeadsPage as Page],
])('%s', (_route, page) => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.withTenantContextMock.mockImplementation(
      (_context: unknown, callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({ tx: true }))
    );
    hoisted.getAgentLeadsCoreMock.mockResolvedValue([]);
  });

  it('redirects an unauthenticated request to the locale login path without a read', async () => {
    authorizeAs(null);

    await expect(render(page)).rejects.toThrow('redirect:/en/login');
    expectNoLeadRead();
  });

  it('authorizes once and never reads the session a second time', async () => {
    authorizeAs(agentUser);

    await render(page);

    expect(hoisted.authorizeSessionTenantMock).toHaveBeenCalledTimes(1);
    expect(hoisted.getSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    'member',
    'staff',
    'branch_manager',
    'admin',
    'tenant_admin',
    'super_admin',
    'promoter',
  ])('refuses a %s session without a read', async role => {
    authorizeAs({ ...agentUser, role });

    await expect(render(page)).rejects.toThrow('notFound');
    expectNoLeadRead();
  });

  it('refuses a session without a role without a read', async () => {
    authorizeAs({ ...agentUser, role: undefined });

    await expect(render(page)).rejects.toThrow('notFound');
    expectNoLeadRead();
  });

  it('refuses a staff session that the layout admitted by an explicit agent-portal grant', async () => {
    // The layout admits explicit tenant grants (effective-portal-access); the session role decides.
    authorizeAs({ id: 'staff-1', role: 'staff', tenantId: 'tenant-1', branchId: 'branch-1' });

    await expect(render(page)).rejects.toThrow('notFound');
    expectNoLeadRead();
  });

  it.each([
    ['no branch', undefined],
    ['a null branch', null],
    ['a blank branch', '  '],
  ])('refuses an agent with %s without a read', async (_label, branchId) => {
    authorizeAs({ ...agentUser, branchId });

    await expect(render(page)).rejects.toThrow('notFound');
    expectNoLeadRead();
  });

  it('propagates a missing tenant without a read', async () => {
    const missing = Object.assign(new Error('Missing tenant'), { name: 'MissingTenantError' });
    hoisted.authorizeSessionTenantMock.mockRejectedValue(missing);

    await expect(render(page)).rejects.toBe(missing);
    expectNoLeadRead();
  });

  it('propagates a failed lead read', async () => {
    authorizeAs(agentUser);
    const failure = new Error('read failed');
    hoisted.getAgentLeadsCoreMock.mockRejectedValue(failure);

    await expect(render(page)).rejects.toBe(failure);
  });

  it("reads the agent's own leads with identity only from the authorization result", async () => {
    authorizeAs(agentUser);
    hoisted.getAgentLeadsCoreMock.mockResolvedValue([{ id: 'lead-1' }]);

    await expect(render(page)).resolves.toBeDefined();

    expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(authority, expect.any(Function));
    // The params and search params name agent-2, branch-2 and tenant-2; none of them is used.
    expect(hoisted.getAgentLeadsCoreMock).toHaveBeenCalledTimes(1);
    expect(hoisted.getAgentLeadsCoreMock).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', agentId: 'agent-1', branchId: 'branch-1' },
      { db: { tx: true } }
    );
  });
});
