import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'member-1',
      role: 'member',
      tenantId: 'tenant_ks',
    },
  })),
  getMemberDashboardDataMock: vi.fn(async () => ({
    member: {
      id: 'member-1',
      name: 'Member One',
      membershipNumber: 'KS-1' as string | null,
      role: 'member',
      tenantId: 'tenant_ks' as string | null,
    },
    claims: [],
    activeClaimId: null,
    supportHref: '/member/help',
  })),
  memberDashboardViewMock: vi.fn((props: unknown) => (
    <div data-testid="member-dashboard-view">{JSON.stringify(props)}</div>
  )),
  memberDashboardV2Mock: vi.fn((props: unknown) => (
    <div data-testid="member-dashboard-v2">{JSON.stringify(props)}</div>
  )),
  redirectMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
  notFound: hoisted.notFoundMock,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
  requireSessionOrRedirect: (session: unknown) => session,
}));

vi.mock('@interdomestik/domain-member', () => ({
  getMemberDashboardData: hoisted.getMemberDashboardDataMock,
}));

vi.mock('@/components/dashboard/member-dashboard-view', () => ({
  MemberDashboardView: (props: unknown) => hoisted.memberDashboardViewMock(props),
  getDashboardSupplementalData: vi.fn(),
}));

vi.mock('@/components/dashboard/member-dashboard-v2', () => ({
  MemberDashboardV2: (props: unknown) => hoisted.memberDashboardV2Mock(props),
}));

vi.mock('./_core', () => ({
  getMemberDashboardCore: vi.fn(() => ({ kind: 'ok', userId: 'member-1' })),
}));

import DashboardPage from './page';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafeMock.mockResolvedValue({
      user: {
        id: 'member-1',
        role: 'member',
        tenantId: 'tenant_ks',
      },
    });
    hoisted.getMemberDashboardDataMock.mockResolvedValue({
      member: {
        id: 'member-1',
        name: 'Member One',
        membershipNumber: 'KS-1',
        role: 'member',
        tenantId: 'tenant_ks',
      },
      claims: [],
      activeClaimId: null,
      supportHref: '/member/help',
    });
  });

  it('renders the richer member dashboard view for the canonical member route', async () => {
    const tree = await DashboardPage({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    expect(screen.getByTestId('member-dashboard-view')).toBeInTheDocument();
    expect(screen.queryByTestId('member-dashboard-v2')).toBeNull();
    expect(hoisted.getMemberDashboardDataMock).toHaveBeenCalledWith({
      memberId: 'member-1',
      tenantId: 'tenant_ks',
    });
  });

  it('passes the exercised member role to dashboard data for agent sessions', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        id: 'agent-1',
        role: 'agent',
        tenantId: 'tenant_ks',
      },
    });
    hoisted.getMemberDashboardDataMock.mockResolvedValueOnce({
      member: {
        id: 'agent-1',
        name: 'Agent One',
        membershipNumber: null,
        role: 'agent',
        tenantId: 'tenant_ks',
      },
      claims: [],
      activeClaimId: null,
      supportHref: '/member/help',
    });

    const tree = await DashboardPage({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    const props = hoisted.memberDashboardViewMock.mock.calls.at(-1)?.[0] as
      | { dataPromise: Promise<{ member: { role: string } }> }
      | undefined;

    await expect(props?.dataPromise).resolves.toMatchObject({
      member: { role: 'member' },
    });
  });
});
