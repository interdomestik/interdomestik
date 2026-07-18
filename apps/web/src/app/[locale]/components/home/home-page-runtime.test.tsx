import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  funnel: vi.fn((_: unknown) => null),
  hero: vi.fn((_: unknown) => null),
  host: vi.fn((): string | null => 'tenant_al'),
  intake: vi.fn((_: unknown) => null),
  replace: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: h.session } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace }) }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({ resolveTenantFromHost: h.host }));
// prettier-ignore
vi.mock('@/i18n/routing', () => ({ Link: () => null, redirect: vi.fn(), usePathname: vi.fn(), useRouter: vi.fn(), getPathname: vi.fn() }));
vi.mock('@/components/analytics/funnel-trackers', () => ({
  FunnelLandingTracker: (props: unknown) => h.funnel(props),
}));
vi.mock('./hero-section', () => ({ HeroSection: (props: unknown) => h.hero(props) }));
vi.mock('./free-start-intake-shell', () => ({
  FreeStartIntakeShell: (props: unknown) => h.intake(props),
}));

import { HomePageRuntime } from './home-page-runtime';

function renderRuntime(defaultPublicTenantId: string | undefined) {
  const props = {
    defaultPublicTenantId,
    locale: 'sq',
    neutralOtpHost: 'front-door.localhost:3000',
    uiV2Enabled: true,
  } as Parameters<typeof HomePageRuntime>[0];
  return render(<HomePageRuntime {...props} />);
}

describe('HomePageRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.session.mockReturnValue({ data: null });
    h.host.mockReturnValue('tenant_al');
  });

  it('preserves the legacy authenticated redirect when UI V2 is disabled', async () => {
    h.session.mockReturnValue({ data: { user: { id: 'user-1', role: 'member' } } });
    render(
      <HomePageRuntime
        defaultPublicTenantId="tenant_ks"
        locale="sq"
        neutralOtpHost="front-door.localhost:3000"
        uiV2Enabled={false}
      />
    );
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/sq/member'));
    expect(h.replace).toHaveBeenCalledOnce();
  });

  it('AX2 keeps distinct host authority out of the neutral OTP hint', async () => {
    renderRuntime('tenant_ks');
    await waitFor(() => {
      expect(h.funnel).toHaveBeenLastCalledWith({
        locale: 'sq',
        tenantId: 'tenant_al',
        uiV2Enabled: true,
      });
      expect(h.hero).toHaveBeenLastCalledWith({
        locale: 'sq',
        primaryHref: '/help-now',
        secondaryHref: '#free-start-intake',
        tenantId: 'tenant_al',
      });
      expect(h.intake).toHaveBeenLastCalledWith({
        continueHref: '/pricing',
        locale: 'sq',
        neutralOtpHost: 'front-door.localhost:3000',
        neutralOtpTenantId: 'tenant_ks',
        publicEntryEnabled: true,
        tenantId: 'tenant_al',
      });
    });
  });

  it('AX2 keeps distinct session authority in legacy consumers only', async () => {
    h.session.mockReturnValue({
      data: { user: { id: 'user-1', role: 'member', tenantId: 'tenant_mk' } },
    });
    renderRuntime('tenant_ks');
    await waitFor(() => {
      expect(h.hero).toHaveBeenLastCalledWith({
        locale: 'sq',
        primaryHref: '/member',
        secondaryHref: '/member/claims/new',
        tenantId: 'tenant_mk',
      });
      expect(h.intake).toHaveBeenLastCalledWith({
        continueHref: '/member/claims/new',
        locale: 'sq',
        neutralOtpHost: 'front-door.localhost:3000',
        neutralOtpTenantId: 'tenant_ks',
        publicEntryEnabled: false,
        tenantId: 'tenant_mk',
      });
    });
  });

  it('AX2 fails closed without falling back when the required hint is unsafely omitted', async () => {
    h.session.mockReturnValue({
      data: { user: { id: 'user-1', role: 'member', tenantId: 'tenant_mk' } },
    });
    renderRuntime(undefined);
    await waitFor(() =>
      expect(h.intake).toHaveBeenLastCalledWith(
        expect.objectContaining({ neutralOtpTenantId: undefined, tenantId: 'tenant_mk' })
      )
    );
    expect(h.hero).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant_ks' }));
    expect(h.funnel).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant_ks' }));
  });
});
