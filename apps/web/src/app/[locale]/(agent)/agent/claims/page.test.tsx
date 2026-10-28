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
  getAgentClaimsCoreMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
  notFound: hoisted.notFoundMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/features/claims/tracking/components/ClaimStatusBadge', () => ({
  ClaimStatusBadge: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: () => null,
}));

vi.mock('@interdomestik/ui', () => ({
  Avatar: () => null,
  AvatarFallback: () => null,
  Card: () => null,
  CardContent: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));

vi.mock('./_core', () => ({
  getAgentClaimsCore: hoisted.getAgentClaimsCoreMock,
  buildAgentWorkspaceClaimHref: (claimId: string) => `/agent/workspace/claims?claimId=${claimId}`,
}));

import AgentClaimsPage from './page';

type PageProps = Parameters<typeof AgentClaimsPage>[0];
type BoundaryElement = ReactElement<{
  fallback: ReactElement<Record<string, unknown>>;
  children: ReactElement<PageProps, (props: PageProps) => Promise<React.ReactNode>>;
}>;

function renderBoundary(): BoundaryElement {
  return AgentClaimsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
  }) as unknown as BoundaryElement;
}

// The async content stays private; it is exercised through the Suspense child.
function renderPage() {
  const child = renderBoundary().props.children;
  return child.type(child.props);
}

describe('AgentClaimsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAgentClaimsCoreMock.mockResolvedValue({ ok: true, data: [] });
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
    expect(hoisted.getAgentClaimsCoreMock).not.toHaveBeenCalled();
  });

  it('passes the access tenant, verified user, actual role and session branch without an ambient db', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: {
        id: 'agent-1',
        accessTenantId: 'tenant-access',
        tenantId: 'tenant-home',
        role: 'agent',
        branchId: 'branch-1',
      },
    });

    await renderPage();

    expect(hoisted.getAgentClaimsCoreMock).toHaveBeenCalledWith({
      tenantId: 'tenant-access',
      userId: 'agent-1',
      role: 'agent',
      branchId: 'branch-1',
    });
  });

  it('falls back to the compatibility home tenant when no access tenant is present', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'agent-1', tenantId: 'tenant-home', role: 'tenant_admin', branchId: null },
    });

    await renderPage();

    expect(hoisted.getAgentClaimsCoreMock).toHaveBeenCalledWith({
      tenantId: 'tenant-home',
      userId: 'agent-1',
      role: 'tenant_admin',
      branchId: null,
    });
  });

  it('does not default a missing role and maps forbidden to notFound', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'agent-1', accessTenantId: 'tenant-access' },
    });
    hoisted.getAgentClaimsCoreMock.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(hoisted.getAgentClaimsCoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: undefined })
    );
  });

  it('throws to the error boundary on internal failure instead of rendering empty', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'agent-1', accessTenantId: 'tenant-access', role: 'agent' },
    });
    hoisted.getAgentClaimsCoreMock.mockResolvedValue({ ok: false, code: 'INTERNAL' });

    await expect(renderPage()).rejects.toThrow('Internal Server Error');
    expect(hoisted.notFoundMock).not.toHaveBeenCalled();
  });
});
