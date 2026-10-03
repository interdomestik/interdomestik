import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  funnel: vi.fn((_: unknown) => null),
  hero: vi.fn((_: unknown) => null),
  host: vi.fn((): string | null => 'tenant_al'),
  intake: vi.fn((_: unknown): ReactNode => null),
  replace: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: h.session } }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'loading' ? 'Duke u ngarkuar...' : key),
}));
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

let intakeMountCount = 0;

function IntakeDraftFixture() {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    intakeMountCount += 1;
  }, []);
  return (
    <input
      data-testid="intake-draft"
      onChange={event => setDraft(event.target.value)}
      value={draft}
    />
  );
}

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
    h.intake.mockImplementation(() => null);
    intakeMountCount = 0;
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

  it('keeps public entry available without tracking while the session is pending', async () => {
    h.session.mockReturnValue({ data: null, isPending: true });
    renderRuntime('tenant_ks');
    expect(screen.getByRole('status', { name: 'Duke u ngarkuar...' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await waitFor(() => {
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
    expect(h.funnel).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('settles an anonymous pending session without disturbing rendered public entry', async () => {
    // A fresh element per render keeps React from bailing out on identical props.
    const runtime = () => (
      <HomePageRuntime
        defaultPublicTenantId="tenant_ks"
        locale="sq"
        neutralOtpHost="front-door.localhost:3000"
        uiV2Enabled
      />
    );
    h.intake.mockImplementation(() => <IntakeDraftFixture />);
    h.session.mockReturnValue({ data: null, isPending: true });
    const { rerender } = render(runtime());

    const pendingStatus = screen.getByRole('status', { name: 'Duke u ngarkuar...' });
    expect(pendingStatus).toHaveAttribute('aria-busy', 'true');
    expect(pendingStatus).toHaveTextContent('Duke u ngarkuar...');
    // No decorative node may occupy layout above the already usable hero.
    expect(pendingStatus.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(h.funnel).not.toHaveBeenCalled();

    const draft = screen.getByTestId('intake-draft');
    draft.focus();
    fireEvent.change(draft, { target: { value: 'Besa' } });
    expect(draft).toHaveValue('Besa');
    const pendingHeroProps = h.hero.mock.lastCall?.[0];
    const pendingIntakeProps = h.intake.mock.lastCall?.[0];

    h.session.mockReturnValue({ data: null, isPending: false });
    rerender(runtime());

    await waitFor(() =>
      expect(h.funnel).toHaveBeenLastCalledWith({
        locale: 'sq',
        tenantId: 'tenant_al',
        uiV2Enabled: true,
      })
    );
    expect(screen.queryByTestId('public-entry-session-skeleton')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Duke u ngarkuar...' })).toBeNull();
    expect(screen.getByTestId('intake-draft')).toBe(draft);
    expect(draft).toHaveValue('Besa');
    expect(draft).toHaveFocus();
    expect(intakeMountCount).toBe(1);
    expect(h.hero).toHaveBeenLastCalledWith(pendingHeroProps);
    expect(h.intake).toHaveBeenLastCalledWith(pendingIntakeProps);
    expect(pendingIntakeProps).toMatchObject({ publicEntryEnabled: true, tenantId: 'tenant_al' });
    expect(h.replace).not.toHaveBeenCalled();
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
