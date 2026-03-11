import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  replaceMock: vi.fn(),
  resolveTenantFromHostMock: vi.fn(() => 'tenant_mk'),
  heroV2Mock: vi.fn((_: unknown) => null),
  freeStartIntakeShellMock: vi.fn((_: unknown) => null),
  funnelLandingTrackerMock: vi.fn((_: unknown) => null),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: hoisted.useSessionMock,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: hoisted.replaceMock,
  }),
}));

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: hoisted.resolveTenantFromHostMock,
}));

vi.mock('@/components/analytics/funnel-trackers', () => ({
  FunnelLandingTracker: (props: unknown) => hoisted.funnelLandingTrackerMock(props),
}));

vi.mock('./hero-v2', () => ({
  HeroV2: (props: unknown) => hoisted.heroV2Mock(props),
}));

vi.mock('./free-start-intake-shell', () => ({
  FreeStartIntakeShell: (props: unknown) => hoisted.freeStartIntakeShellMock(props),
}));

import { HomePageRuntime } from './home-page-runtime';

describe('HomePageRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useSessionMock.mockReturnValue({ data: null });
    hoisted.resolveTenantFromHostMock.mockReturnValue('tenant_mk');
  });

  it('redirects authenticated users to the member portal when UI V2 is disabled', async () => {
    hoisted.useSessionMock.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          role: 'member',
        },
      },
    });

    render(<HomePageRuntime locale="sq" uiV2Enabled={false} />);

    await waitFor(() => {
      expect(hoisted.replaceMock).toHaveBeenCalledWith('/sq/member');
    });
    expect(hoisted.replaceMock).toHaveBeenCalledTimes(1);
  });

  it('uses host tenant fallback for the V2 landing tracker and CTA when signed out', async () => {
    render(<HomePageRuntime locale="sq" uiV2Enabled={true} />);

    await waitFor(() => {
      expect(hoisted.funnelLandingTrackerMock).toHaveBeenCalledWith({
        locale: 'sq',
        tenantId: 'tenant_mk',
        uiV2Enabled: true,
      });
      expect(hoisted.heroV2Mock).toHaveBeenCalledWith({
        locale: 'sq',
        startClaimHref: '#free-start-intake',
        tenantId: 'tenant_mk',
      });
      expect(hoisted.freeStartIntakeShellMock).toHaveBeenCalledWith({
        continueHref: '/register',
        locale: 'sq',
        tenantId: 'tenant_mk',
      });
    });
    expect(hoisted.funnelLandingTrackerMock).toHaveBeenCalledTimes(1);
  });

  it('uses session-aware CTA targeting for signed-in members on UI V2', async () => {
    hoisted.useSessionMock.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          role: 'member',
          tenantId: 'tenant_ks',
        },
      },
    });

    render(<HomePageRuntime locale="sq" uiV2Enabled={true} />);

    await waitFor(() => {
      expect(hoisted.heroV2Mock).toHaveBeenCalledWith({
        locale: 'sq',
        startClaimHref: '/member/claims/new',
        tenantId: 'tenant_ks',
      });
      expect(hoisted.freeStartIntakeShellMock).toHaveBeenCalledWith({
        continueHref: '/member/claims/new',
        locale: 'sq',
        tenantId: 'tenant_ks',
      });
    });
  });
});
