import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  getSessionMock: vi.fn(),
  getAgentWorkspaceClaimsCoreMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
  notFound: hoisted.notFoundMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/features/agent/claims/components/AgentClaimsProPage', () => ({
  AgentClaimsProPage: () => null,
}));

vi.mock('./_core', () => ({
  getAgentWorkspaceClaimsCore: hoisted.getAgentWorkspaceClaimsCoreMock,
}));

import AgentWorkspaceClaimsPage from './page';

type SearchParams = { claimId?: string | string[]; selected?: string | string[] };
type PageProps = Parameters<typeof AgentWorkspaceClaimsPage>[0];
type BoundaryElement = ReactElement<{
  fallback: ReactElement<Record<string, unknown>>;
  children: ReactElement<PageProps, (props: PageProps) => Promise<React.ReactNode>>;
}>;

function renderBoundary(searchParams: SearchParams = {}): BoundaryElement {
  return AgentWorkspaceClaimsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  }) as unknown as BoundaryElement;
}

// The async content stays private; it is exercised through the Suspense child.
function renderPage(searchParams: SearchParams = {}) {
  const child = renderBoundary(searchParams).props.children;
  return child.type(child.props);
}

const agentUser = {
  id: 'agent-1',
  name: 'Agent One',
  image: null,
  role: 'agent',
  accessTenantId: 'tenant-access',
  tenantId: 'tenant-home',
};

describe('AgentWorkspaceClaimsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAgentWorkspaceClaimsCoreMock.mockResolvedValue({ ok: true, claims: [] });
  });

  it('reads request-specific auth behind a Suspense boundary with a busy status fallback', () => {
    const boundary = renderBoundary();

    expect(boundary.type).toBe(Suspense);
    expect(boundary.props.fallback.type).toBe('output');
    expect(boundary.props.fallback.props['aria-busy']).toBe('true');
    expect(hoisted.getSessionMock).not.toHaveBeenCalled();
    expect(hoisted.headersMock).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users to the locale login path', async () => {
    hoisted.getSessionMock.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('redirect:/en/login');
    expect(hoisted.getAgentWorkspaceClaimsCoreMock).not.toHaveBeenCalled();
  });

  it('passes access tenant, verified user, actual role and selected precedence without an ambient db', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: agentUser });

    const element = (await renderPage({ selected: 's1', claimId: 'c1' })) as unknown as {
      props: { selectedClaimId?: string; currentUser: { role: string } };
    };

    expect(hoisted.getAgentWorkspaceClaimsCoreMock).toHaveBeenCalledWith({
      tenantId: 'tenant-access',
      userId: 'agent-1',
      role: 'agent',
      selectedClaimId: 's1',
    });
    expect(element.props.selectedClaimId).toBe('s1');
    expect(element.props.currentUser.role).toBe('agent');
  });

  it('falls back to the compatibility home tenant and claimId parameter', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { ...agentUser, accessTenantId: null, role: 'tenant_admin' },
    });

    const element = (await renderPage({ claimId: 'c1' })) as unknown as {
      props: { currentUser: { role: string } };
    };

    expect(hoisted.getAgentWorkspaceClaimsCoreMock).toHaveBeenCalledWith({
      tenantId: 'tenant-home',
      userId: 'agent-1',
      role: 'tenant_admin',
      selectedClaimId: 'c1',
    });
    expect(element.props.currentUser.role).toBe('tenant_admin');
  });

  it('keeps the first array entry, selected precedence and the empty-selected fallback', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: agentUser });

    await renderPage({ selected: ['s1', 's2'], claimId: ['c1'] });
    await renderPage({ selected: '', claimId: ['c1', 'c2'] });
    await renderPage({ selected: [''], claimId: 'c3' });
    await renderPage({ selected: [], claimId: [] });

    expect(
      hoisted.getAgentWorkspaceClaimsCoreMock.mock.calls.map(([input]) => input.selectedClaimId)
    ).toEqual(['s1', 'c1', 'c3', undefined]);
  });

  it('ignores malformed non-string search params without changing tenant, user or role', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: agentUser });
    const capability = { transaction: vi.fn(), execute: vi.fn() };

    const element = (await renderPage({
      selected: [capability],
      claimId: { 0: 'c1', length: 1 },
    } as unknown as SearchParams)) as unknown as { props: { selectedClaimId?: string } };

    expect(hoisted.getAgentWorkspaceClaimsCoreMock).toHaveBeenCalledWith({
      tenantId: 'tenant-access',
      userId: 'agent-1',
      role: 'agent',
      selectedClaimId: undefined,
    });
    expect(element.props.selectedClaimId).toBeUndefined();
    expect(capability.transaction).not.toHaveBeenCalled();
    expect(capability.execute).not.toHaveBeenCalled();
  });

  it('reads an array entry once so a changing getter cannot substitute a non-string', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: agentUser });
    let reads = 0;
    const selected: string[] = [];
    Object.defineProperty(selected, 0, {
      get: () => (++reads === 1 ? 's1' : { escaped: true }),
    });

    await renderPage({ selected });

    expect(reads).toBe(1);
    expect(hoisted.getAgentWorkspaceClaimsCoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectedClaimId: 's1' })
    );
  });

  it('fails closed on a missing role without calling the core', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: { ...agentUser, role: undefined } });

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(hoisted.getAgentWorkspaceClaimsCoreMock).not.toHaveBeenCalled();
  });

  it('maps a forbidden core result to notFound', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: { ...agentUser, role: 'member' } });
    hoisted.getAgentWorkspaceClaimsCoreMock.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });

    await expect(renderPage()).rejects.toThrow('notFound');
  });

  it('propagates core failures to the error boundary', async () => {
    hoisted.getSessionMock.mockResolvedValue({ user: agentUser });
    hoisted.getAgentWorkspaceClaimsCoreMock.mockRejectedValue(new Error('permission denied'));

    await expect(renderPage()).rejects.toThrow('permission denied');
    expect(hoisted.notFoundMock).not.toHaveBeenCalled();
  });
});
