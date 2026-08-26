import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headers: vi.fn(),
  session: vi.fn(),
  messages: vi.fn(async () => ({})),
  retired: vi.fn(),
  legacy: vi.fn(),
  runtime: vi.fn((_: unknown) => null),
  freeStart: vi.fn((_: unknown) => null),
  tenant: vi.fn(() => 'tenant_ks'),
  setLocale: vi.fn(),
  flag: true,
}));

function Probe({ name, retired = false }: { name: string; retired?: boolean }) {
  if (retired) hoisted.retired(name);
  return retired ? <div data-testid="retired" /> : <div data-entry-door-section={name} />;
}

const keep = (name: string) => <Probe name={name} />;
const retire = (name: string) => <Probe name={name} retired />;

vi.mock('next/dynamic', () => {
  let index = 0;
  const names = ['FAQ', 'Testimonials'];
  return {
    default: () => {
      const name = names[index++];
      return () => retire(name ?? 'Unknown');
    },
  };
});

vi.mock('next/headers', () => ({ headers: hoisted.headers }));

vi.mock('@/lib/auth.core', () => ({
  auth: {
    api: {
      getSession: hoisted.session,
    },
  },
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.messages,
  setRequestLocale: hoisted.setLocale,
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/i18n/messages', () => ({
  BASE_NAMESPACES: ['common'],
  HOME_NAMESPACES: ['hero'],
  pickMessages: (messages: object) => messages,
}));

vi.mock('@/lib/flags', () => ({ isUiV2Enabled: () => hoisted.flag }));

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveDefaultPublicTenantId: hoisted.tenant,
}));

vi.mock('./components/home/cta-section', () => ({
  CTASection: () => retire('Final CTA'),
}));
vi.mock('./components/home/footer', () => ({ Footer: () => keep('Footer') }));
vi.mock('./components/home/free-start-intake-shell', () => ({
  FreeStartIntakeShell: (props: unknown) => hoisted.freeStart(props),
}));
vi.mock('./components/home/header', () => ({ Header: () => keep('Header') }));
vi.mock('./components/home/hero-section', () => ({ HeroSection: hoisted.legacy }));
vi.mock('./components/home/home-page-runtime', () => ({
  HomePageRuntime: (props: unknown) => {
    hoisted.runtime(props);
    return keep('HomePageRuntime');
  },
}));
vi.mock('./components/home/how-membership-works-section', () => ({
  HowMembershipWorksSection: () => retire('How Membership Works'),
}));
vi.mock('./components/home/member-benefits-section', () => ({
  MemberBenefitsSection: () => retire('Member Benefits'),
}));
vi.mock('./components/home/pricing-section', () => ({
  PricingSection: () => keep('PricingSection'),
}));
vi.mock('./components/home/sticky-mobile-cta', () => ({
  StickyPrimeCTA: hoisted.legacy,
}));
vi.mock('./components/home/trust-stats-section', () => ({
  TrustStatsSection: () => retire('Trust Stats'),
}));
vi.mock('./components/home/trust-strip', () => ({
  TrustStrip: () => retire('Trust Strip'),
}));
vi.mock('./components/home/voice-claim-section', () => ({
  VoiceClaimSection: () => retire('Voice Claim'),
}));
import HomePage from './page';
import * as page from './page';

const home = async (locale = 'sq') =>
  render(await HomePage({ params: Promise.resolve({ locale }) }));
const props = (locale: string, neutralOtpHost: string | null = 'front-door.localhost:3000') => ({
  defaultPublicTenantId: 'tenant_ks',
  locale,
  neutralOtpHost,
  uiV2Enabled: true,
});

describe('HomePage server shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDA_HOST = 'https://front-door.localhost:3000';
    hoisted.flag = true;
    hoisted.tenant.mockReturnValue('tenant_ks');
  });

  it('renders only retained sections', async () => {
    const view = await home();
    const sections = Array.from(
      view.getByTestId('landing-page-ready').querySelectorAll('[data-entry-door-section]')
    ).map(section => section.getAttribute('data-entry-door-section'));

    expect(sections).toEqual(['Header', 'HomePageRuntime', 'PricingSection', 'Footer']);
    expect(hoisted.retired).not.toHaveBeenCalled();
    expect(view.queryByTestId(/^retired/)).not.toBeInTheDocument();
  });

  it('exports locales', () => {
    expect(page.generateStaticParams()).toEqual(
      ['sq', 'en', 'sr', 'mk'].map(locale => ({ locale }))
    );
  });

  it('avoids request/session reads', async () => {
    expect(await HomePage({ params: Promise.resolve({ locale: 'sq' }) })).toBeTruthy();
    expect(hoisted.setLocale).toHaveBeenCalledWith('sq');
    expect(hoisted.headers).not.toHaveBeenCalled();
    expect(hoisted.session).not.toHaveBeenCalled();
  });

  it('propagates AX1', async () => {
    await home();

    expect(hoisted.tenant).toHaveBeenCalledOnce();
    expect(hoisted.runtime).toHaveBeenCalledExactlyOnceWith(props('sq'));
    expect(hoisted.freeStart).not.toHaveBeenCalled();
  });

  it('keeps Hero V2 when flag is retired', async () => {
    hoisted.flag = false;
    const view = await home('en');

    expect(hoisted.tenant).toHaveBeenCalledOnce();
    expect(hoisted.runtime).toHaveBeenCalledExactlyOnceWith(props('en'));
    expect(hoisted.freeStart).not.toHaveBeenCalled();
    expect(hoisted.legacy).not.toHaveBeenCalled();
    expect(view.getByTestId('landing-page-ready')).toHaveAttribute('data-variant', 'hero_v2');
  });

  it('rejects malformed AX1', async () => {
    process.env.IDA_HOST = 'https://front-door.localhost:3000/unexpected';
    await home();
    expect(hoisted.runtime).toHaveBeenCalledWith(props('sq', null));
  });
});
