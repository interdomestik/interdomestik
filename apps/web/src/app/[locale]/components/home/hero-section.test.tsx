import type { ReactNode } from 'react';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroSection } from './hero-section';

const { getSupportContacts } = vi.hoisted(() => ({
  getSupportContacts: vi.fn(() => ({
    phoneE164: '+38349900600',
    phoneDisplay: '+383 49 900 600',
    telHref: 'tel:+38349900600',
    whatsappE164: '+38349900600',
    whatsappHref: 'https://wa.me/38349900600' as const,
  })),
}));

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({ hero: sqHeroMessages.hero })),
}));

vi.mock('@/lib/support-contacts', () => ({ getSupportContacts }));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('HeroSection', () => {
  it('renders the approved Help Now hierarchy for an anonymous visitor', () => {
    render(<HeroSection locale="sq" tenantId="tenant_ks" />);

    const hero = screen.getByTestId('public-entry-hero');
    expect(within(hero).getByText('NDIHMË TANI')).toBeInTheDocument();
    expect(
      within(hero).getByRole('heading', { level: 1, name: 'Çfarë ju ka ndodhur?' })
    ).toBeInTheDocument();
    expect(within(hero).getByTestId('public-entry-situations')).toBeInTheDocument();
    expect(within(hero).getByTestId('public-entry-membership')).toHaveAttribute('href', '/pricing');
    expect(getSupportContacts).toHaveBeenCalledWith({ locale: 'sq', tenantId: 'tenant_ks' });
    expect(
      within(hero).queryByText(/udhëzime praktike|4\.9|8[.,]500|100\s?%|24\/7/i)
    ).not.toBeInTheDocument();
  });

  it('preserves settled-member continuation without public acquisition actions', () => {
    render(
      <HeroSection
        locale="sq"
        primaryHref="/member"
        secondaryHref="/member/claims/new"
        tenantId="tenant_ks"
      />
    );

    const hero = screen.getByTestId('public-entry-hero');
    expect(within(hero).getByRole('link', { name: /Hap hapësirën time/i })).toHaveAttribute(
      'href',
      '/member'
    );
    expect(within(hero).getByRole('link', { name: /Nis një rast të ri/i })).toHaveAttribute(
      'href',
      '/member/claims/new'
    );
    expect(within(hero).queryByTestId('public-entry-situations')).not.toBeInTheDocument();
  });
});
