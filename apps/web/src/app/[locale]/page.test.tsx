import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  setRequestLocaleMock: vi.fn(),
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
  isUiV2Enabled: () => true,
}));

vi.mock('./components/home/cta-section', () => ({ CTASection: () => null }));
vi.mock('./components/home/footer', () => ({ Footer: () => null }));
vi.mock('./components/home/header', () => ({ Header: () => null }));
vi.mock('./components/home/hero-section', () => ({ HeroSection: () => null }));
vi.mock('./components/home/hero-v2', () => ({ HeroV2: () => null }));
vi.mock('./components/home/home-page-runtime', () => ({ HomePageRuntime: () => null }));
vi.mock('./components/home/how-membership-works-section', () => ({
  HowMembershipWorksSection: () => null,
}));
vi.mock('./components/home/member-benefits-section', () => ({
  MemberBenefitsSection: () => null,
}));
vi.mock('./components/home/pricing-section', () => ({ PricingSection: () => null }));
vi.mock('./components/home/sticky-mobile-cta', () => ({ StickyPrimeCTA: () => null }));
vi.mock('./components/home/trust-stats-section', () => ({ TrustStatsSection: () => null }));
vi.mock('./components/home/trust-strip', () => ({ TrustStrip: () => null }));
vi.mock('./components/home/voice-claim-section', () => ({ VoiceClaimSection: () => null }));
vi.mock('@/components/analytics/funnel-trackers', () => ({
  FunnelLandingTracker: () => null,
}));

import HomePage from './page';
import * as HomePageModule from './page';

describe('HomePage server shell', () => {
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
});
