import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers([['host', 'mk.localhost:3000']])),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'user-1',
      role: 'member',
      tenantId: 'tenant_mk',
    },
  })),
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    home: { title: 'Home' },
  })),
  legacyMountMock: vi.fn(),
  homePageRuntimeMock: vi.fn((_: unknown) => null),
  freeStartIntakeShellMock: vi.fn((_: unknown) => null),
  resolveDefaultPublicTenantIdMock: vi.fn(() => 'tenant_ks'),
  setRequestLocaleMock: vi.fn(),
  uiV2Enabled: true,
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('@/lib/auth.core', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/i18n/messages', () => ({
  BASE_NAMESPACES: ['common'],
  HOME_NAMESPACES: ['hero'],
  pickMessages: (messages: Record<string, unknown>) => messages,
}));

vi.mock('@/lib/flags', () => ({
  isUiV2Enabled: () => hoisted.uiV2Enabled,
}));

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveDefaultPublicTenantId: hoisted.resolveDefaultPublicTenantIdMock,
}));

vi.mock('./components/home/cta-section', () => ({ CTASection: () => null }));
vi.mock('./components/home/footer', () => ({ Footer: () => null }));
vi.mock('./components/home/free-start-intake-shell', () => ({
  FreeStartIntakeShell: (props: unknown) => hoisted.freeStartIntakeShellMock(props),
}));
vi.mock('./components/home/header', () => ({ Header: () => null }));
vi.mock('./components/home/hero-section', () => ({ HeroSection: hoisted.legacyMountMock }));
vi.mock('./components/home/home-page-runtime', () => ({
  HomePageRuntime: (props: unknown) => hoisted.homePageRuntimeMock(props),
}));
vi.mock('./components/home/how-membership-works-section', () => ({
  HowMembershipWorksSection: () => null,
}));
vi.mock('./components/home/member-benefits-section', () => ({
  MemberBenefitsSection: () => null,
}));
vi.mock('./components/home/pricing-section', () => ({ PricingSection: () => null }));
vi.mock('./components/home/sticky-mobile-cta', () => ({
  StickyPrimeCTA: hoisted.legacyMountMock,
}));
vi.mock('./components/home/trust-stats-section', () => ({ TrustStatsSection: () => null }));
vi.mock('./components/home/trust-strip', () => ({ TrustStrip: () => null }));
vi.mock('./components/home/voice-claim-section', () => ({ VoiceClaimSection: () => null }));
import HomePage from './page';
import * as HomePageModule from './page';

describe('HomePage server shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDA_HOST = 'https://front-door.localhost:3000';
    hoisted.uiV2Enabled = true;
    hoisted.resolveDefaultPublicTenantIdMock.mockReturnValue('tenant_ks');
  });

  it('exports locale static params for public prerendering', () => {
    expect(HomePageModule.generateStaticParams()).toEqual([
      { locale: 'sq' },
      { locale: 'en' },
      { locale: 'sr' },
      { locale: 'mk' },
    ]);
  });

  it('does not read request headers or session data while rendering the locale landing shell', async () => {
    const tree = await HomePage({
      params: Promise.resolve({ locale: 'sq' }),
    });

    expect(tree).toBeTruthy();
    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('sq');
    expect(hoisted.headersMock).not.toHaveBeenCalled();
    expect(hoisted.getSessionMock).not.toHaveBeenCalled();
  });

  it('AX1 resolves one server authority and propagates it to the UI-v2 Free Start seam', async () => {
    const tree = await HomePage({ params: Promise.resolve({ locale: 'sq' }) });
    render(tree);

    expect(hoisted.resolveDefaultPublicTenantIdMock).toHaveBeenCalledOnce();
    // prettier-ignore
    expect(hoisted.homePageRuntimeMock).toHaveBeenCalledExactlyOnceWith({ defaultPublicTenantId: 'tenant_ks', locale: 'sq', neutralOtpHost: 'front-door.localhost:3000', uiV2Enabled: true });
    expect(hoisted.freeStartIntakeShellMock).not.toHaveBeenCalled();
  });

  it('ignores the retired UI-v1 flag and always mounts the canonical runtime', async () => {
    hoisted.uiV2Enabled = false;
    const tree = await HomePage({ params: Promise.resolve({ locale: 'en' }) });
    const view = render(tree);

    expect(hoisted.resolveDefaultPublicTenantIdMock).toHaveBeenCalledOnce();
    // prettier-ignore
    expect(hoisted.homePageRuntimeMock).toHaveBeenCalledExactlyOnceWith({ defaultPublicTenantId: 'tenant_ks', locale: 'en', neutralOtpHost: 'front-door.localhost:3000', uiV2Enabled: true });
    expect(hoisted.freeStartIntakeShellMock).not.toHaveBeenCalled();
    expect(hoisted.legacyMountMock).not.toHaveBeenCalled();
    expect(view.getByTestId('landing-page-ready')).toHaveAttribute('data-variant', 'hero_v2');
  });

  it('AX1 rejects malformed configured IDA authority instead of exposing the save seam', async () => {
    process.env.IDA_HOST = 'https://front-door.localhost:3000/unexpected';
    render(await HomePage({ params: Promise.resolve({ locale: 'sq' }) }));
    expect(hoisted.homePageRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({ neutralOtpHost: null })
    );
  });
});
