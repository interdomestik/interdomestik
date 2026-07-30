import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  neutralHost: true,
  // prettier-ignore
  session: vi.fn(async () => ({ user: { id: 'member-1', role: 'member', tenantId: 'tenant_ks' } })),
  // prettier-ignore
  data: vi.fn(async () => ({ member: { id: 'member-1', name: 'Member One', membershipNumber: 'KS-1' as string | null, role: 'member', tenantId: 'tenant_ks' as string | null }, claims: [], activeClaimId: null, supportHref: '/member/help' })),
  view: vi.fn((props: unknown) => (
    <div data-testid="member-dashboard-view">{JSON.stringify(props)}</div>
  )),
  go: vi.fn(),
  missing: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: h.go,
  notFound: h.missing,
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'ida.localhost' })),
}));
vi.mock('@/app/api/auth/[...all]/neutral-otp-boundary', () => ({
  evaluateNeutralOtpHost: vi.fn(() => h.neutralHost),
}));
vi.mock('@/lib/tenant/tenant-hosts', () => ({ resolveDefaultPublicTenantId: () => 'tenant_ks' }));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: h.session,
  requireSessionOrRedirect: (session: unknown) => session,
}));

vi.mock('@interdomestik/domain-member', () => ({
  getMemberDashboardData: h.data,
}));

vi.mock('@/components/dashboard/member-dashboard-view', () => ({
  MemberDashboardView: (props: unknown) => h.view(props),
  getDashboardSupplementalData: vi.fn(),
}));

vi.mock('./_core', () => ({
  getMemberDashboardCore: vi.fn(() => ({ kind: 'ok', userId: 'member-1' })),
}));

import DashboardPage from './page';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.neutralHost = true;
    h.session.mockResolvedValue({
      user: {
        id: 'member-1',
        role: 'member',
        tenantId: 'tenant_ks',
      },
    });
    h.data.mockResolvedValue({
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

  // prettier-ignore
  it.each([['member','tenant_ks',true,true],['user','tenant_ks',true,true],['agent','tenant_ks',true,false],['member','tenant_mk',true,false],['member','tenant_ks',false,false]])('limits dashboard draft entry',async(role,tenantId,neutral,expected)=>{
    h.neutralHost=neutral; h.session.mockResolvedValueOnce({user:{id:'m',role,tenantId}});
    render(await DashboardPage({params:Promise.resolve({locale:'sq'})}));
    expect(h.view).toHaveBeenLastCalledWith(expect.objectContaining({draftManagerAvailable:expected}));
  });

  it('renders the canonical member dashboard', async () => {
    const tree = await DashboardPage({
      params: Promise.resolve({ locale: 'mk' }),
    });

    render(tree);

    expect(screen.getByTestId('member-dashboard-view')).toBeInTheDocument();
    expect(h.view).toHaveBeenCalledWith(expect.objectContaining({ draftManagerAvailable: true }));
    expect(h.data).toHaveBeenCalledWith({
      memberId: 'member-1',
      tenantId: 'tenant_ks',
    });
  });

  it('coerces agent view and hides draft entry', async () => {
    h.session.mockResolvedValueOnce({
      user: {
        id: 'agent-1',
        role: 'agent',
        tenantId: 'tenant_ks',
      },
    });
    h.data.mockResolvedValueOnce({
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

    const props = h.view.mock.calls.at(-1)?.[0] as
      | { dataPromise: Promise<{ member: { role: string } }>; draftManagerAvailable: boolean }
      | undefined;

    await expect(props?.dataPromise).resolves.toMatchObject({
      member: { role: 'member' },
    });
    expect(props?.draftManagerAvailable).toBe(false);
  });
});
