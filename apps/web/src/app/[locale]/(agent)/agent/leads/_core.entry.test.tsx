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
  ensureTenantIdMock: vi.fn(),
  authorizeSessionTenantMock: vi.fn(),
  findAgentSettingsMock: vi.fn(),
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

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantIdMock,
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContextMock,
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentSettings: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/features/agent/leads/components/AgentLeadsProPage', () => ({
  AgentLeadsProPage: () => null,
}));

vi.mock('./_core', () => ({
  getAgentLeadsCore: hoisted.getAgentLeadsCoreMock,
}));

import AgentLeadsEntry from './_core.entry';

const authority = mintTestTenantAuthority('tenant-1');

function mockEntrySession(user: Record<string, string | undefined> | null) {
  const session = user ? { user } : null;
  hoisted.getSessionMock.mockResolvedValue(session);
  hoisted.authorizeSessionTenantMock.mockResolvedValue(session ? { session, authority } : null);
}

function expectEntryNotFound() {
  return expect(
    AgentLeadsEntry({
      params: Promise.resolve({ locale: 'en' }),
    })
  ).rejects.toThrow('notFound');
}

function expectNoLeadEntryDataAccess() {
  expect(hoisted.ensureTenantIdMock).not.toHaveBeenCalled();
  expect(hoisted.findAgentSettingsMock).not.toHaveBeenCalled();
  expect(hoisted.getAgentLeadsCoreMock).not.toHaveBeenCalled();
}

describe('AgentLeadsEntry auth redirect', () => {
  beforeEach(() => {
    hoisted.headersMock.mockClear();
    hoisted.redirectMock.mockClear();
    hoisted.notFoundMock.mockClear();
    hoisted.getSessionMock.mockReset();
    hoisted.authorizeSessionTenantMock.mockReset();
    hoisted.ensureTenantIdMock.mockReset();
    hoisted.findAgentSettingsMock.mockReset();
    hoisted.getAgentLeadsCoreMock.mockReset();
    hoisted.withTenantContextMock.mockReset();
    hoisted.withTenantContextMock.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({ query: { agentSettings: { findFirst: hoisted.findAgentSettingsMock } } })
    );
  });

  it('redirects unauthenticated users to the locale login path', async () => {
    mockEntrySession(null);

    await expect(
      AgentLeadsEntry({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });

  it('renders notFound for a member session even with pro agent settings', async () => {
    mockEntrySession({
      id: 'member-1',
      role: 'member',
      tenantId: 'tenant-1',
    });
    hoisted.findAgentSettingsMock.mockResolvedValue({ tier: 'pro' });

    await expectEntryNotFound();
    expectNoLeadEntryDataAccess();
  });

  it('renders notFound for a standard-tier agent', async () => {
    mockEntrySession({
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    hoisted.findAgentSettingsMock.mockResolvedValue({ tier: 'standard' });

    await expectEntryNotFound();

    expect(hoisted.getAgentLeadsCoreMock).not.toHaveBeenCalled();
  });

  it('renders notFound for an agent session without branch scope', async () => {
    mockEntrySession({
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
    });

    await expectEntryNotFound();
    expectNoLeadEntryDataAccess();
  });

  it('loads leads for a pro agent session', async () => {
    mockEntrySession({
      id: 'agent-1',
      role: 'agent',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    hoisted.findAgentSettingsMock.mockResolvedValue({ tier: 'pro' });
    hoisted.getAgentLeadsCoreMock.mockResolvedValue([{ id: 'lead-1' }]);

    await expect(
      AgentLeadsEntry({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).resolves.toBeDefined();

    expect(hoisted.withTenantContextMock).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.getAgentLeadsCoreMock).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', agentId: 'agent-1', branchId: 'branch-1' },
      expect.any(Object)
    );
  });
});
