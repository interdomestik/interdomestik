import type { ReactNode } from 'react';
import enHeroMessages from '@/messages/en/hero.json';
import mkHeroMessages from '@/messages/mk/hero.json';
import sqHeroMessages from '@/messages/sq/hero.json';
import srHeroMessages from '@/messages/sr/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroSection } from './hero-section';

const { getPathname, getSupportContacts, mockState } = vi.hoisted(() => ({
  getPathname: vi.fn(({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`),
  getSupportContacts: vi.fn(() => ({
    phoneE164: '+38349900600',
    phoneDisplay: '+383 49 900 600',
    telHref: 'tel:+38349900600',
    whatsappE164: '+38349900600',
    whatsappHref: 'https://wa.me/38349900600' as const,
  })),
  mockState: { locale: 'sq' as 'sq' | 'en' | 'mk' | 'sr' },
}));

const heroMessagesByLocale = {
  sq: sqHeroMessages.hero,
  en: enHeroMessages.hero,
  mk: mkHeroMessages.hero,
  sr: srHeroMessages.hero,
};

vi.mock('next-intl', () => ({
  useLocale: () => mockState.locale,
  useTranslations: createUseTranslationsMock(() => ({
    hero: heroMessagesByLocale[mockState.locale],
  })),
}));

vi.mock('@/lib/support-contacts', () => ({ getSupportContacts }));

vi.mock('@/i18n/routing', () => ({
  getPathname,
  routing: {
    locales: ['sq', 'en', 'mk', 'sr'] as const,
    defaultLocale: 'sq' as const,
  },
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a href={href} data-client-link="true" {...props}>
      {children}
    </a>
  ),
}));

const MEMBER_CASES = [
  {
    locale: 'sq',
    primaryLabel: 'Hap hapësirën time',
    secondaryLabel: 'Nis një rast të ri',
    primaryHref: '/sq/member',
    secondaryHref: '/sq/member/claims/new',
  },
  {
    locale: 'en',
    primaryLabel: 'Open my member space',
    secondaryLabel: 'Start a new case',
    primaryHref: '/en/member',
    secondaryHref: '/en/member/claims/new',
  },
  {
    locale: 'mk',
    primaryLabel: 'Отворете го мојот простор',
    secondaryLabel: 'Започнете нов случај',
    primaryHref: '/mk/member',
    secondaryHref: '/mk/member/claims/new',
  },
  {
    locale: 'sr',
    primaryLabel: 'Otvorite moj prostor',
    secondaryLabel: 'Pokrenite novi slučaj',
    primaryHref: '/sr/member',
    secondaryHref: '/sr/member/claims/new',
  },
] as const;

describe('HeroSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.locale = 'sq';
  });

  it('renders anonymous Help Now hierarchy', () => {
    render(<HeroSection locale="sq" tenantId="tenant_ks" />);
    const hero = screen.getByTestId('public-entry-hero');
    expect(within(hero).getByText('NDIHMË TANI')).toBeInTheDocument();
    expect(
      within(hero).getByRole('heading', { level: 1, name: 'Çfarë ju ka ndodhur?' })
    ).toBeInTheDocument();
    expect(within(hero).getByTestId('public-entry-situations')).toBeInTheDocument();
    expect(hero.querySelector('a[href*="/pricing"]')).toBeNull();
    expect(hero.firstElementChild?.children).toHaveLength(2);
    expect(getSupportContacts).toHaveBeenCalledWith({ locale: 'sq', tenantId: 'tenant_ks' });
    expect(
      within(hero).queryByText(/udhëzime praktike|4\.9|8[.,]500|100\s?%|24\/7/i)
    ).not.toBeInTheDocument();
  });

  it('keeps anonymous acquisition actions on the existing client Link contract', () => {
    render(<HeroSection locale="sq" primaryHref="/help-now" tenantId="tenant_ks" />);

    const hero = screen.getByTestId('public-entry-hero');
    const situations = within(hero).getByTestId('public-entry-situations');
    expect(within(hero).queryByRole('link', { name: /Hap hapësirën time/i })).toBeNull();
    expect(hero.querySelector('a[href="/member"], a[href="/sq/member"]')).toBeNull();
    expect(situations.querySelector('a[data-client-link="true"]')).not.toBeNull();
  });

  it.each(MEMBER_CASES)(
    'renders native locale-qualified member anchors for $locale',
    ({ locale, primaryLabel, secondaryLabel, primaryHref, secondaryHref }) => {
      mockState.locale = locale;
      render(
        <HeroSection
          locale={locale}
          primaryHref="/member"
          secondaryHref="/member/claims/new"
          tenantId="tenant_ks"
        />
      );

      const hero = screen.getByTestId('public-entry-hero');
      const primary = within(hero).getByRole('link', { name: primaryLabel });
      const secondary = within(hero).getByRole('link', { name: secondaryLabel });
      expect(within(hero).getAllByRole('link')).toHaveLength(2);

      for (const [anchor, expectedHref] of [
        [primary, primaryHref],
        [secondary, secondaryHref],
      ] as const) {
        expect(anchor.tagName).toBe('A');
        expect(anchor).not.toHaveAttribute('data-client-link');
        expect(anchor).toHaveAttribute('href', expectedHref);
        expect(anchor).not.toHaveAttribute('target');
        expect(anchor).not.toHaveAttribute('download');
        expect(anchor).toHaveClass('min-h-12');
      }

      expect(primary.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(within(hero).queryByRole('button')).toBeNull();
      expect(within(hero).queryByTestId('public-entry-situations')).not.toBeInTheDocument();
      expect(getPathname).toHaveBeenCalledWith({ href: '/member', locale });
      expect(getPathname).toHaveBeenCalledWith({ href: '/member/claims/new', locale });
    }
  );

  it('uses the active locale when the optional locale prop is absent', () => {
    mockState.locale = 'en';
    render(<HeroSection primaryHref="/member" tenantId="tenant_ks" />);

    const primary = screen.getByRole('link', { name: 'Open my member space' });
    expect(primary).toHaveAttribute('href', '/en/member');
    expect(primary).not.toHaveAttribute('data-client-link');
  });

  it('renders only the primary native anchor without a secondary destination', () => {
    mockState.locale = 'en';
    render(<HeroSection locale="en" primaryHref="/member" tenantId="tenant_ks" />);

    const links = within(screen.getByTestId('public-entry-hero')).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/en/member');
    expect(links[0]).not.toHaveAttribute('data-client-link');
  });

  it('falls back to the active routing locale for an unsupported locale prop', () => {
    mockState.locale = 'mk';
    render(<HeroSection locale="xx" primaryHref="/member" tenantId="tenant_mk" />);

    const primary = screen.getByRole('link', { name: 'Отворете го мојот простор' });
    expect(primary).toHaveAttribute('href', '/mk/member');
  });
});
