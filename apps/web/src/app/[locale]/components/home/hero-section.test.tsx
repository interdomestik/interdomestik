import type { ReactNode } from 'react';
import sqHeroMessages from '@/messages/sq/hero.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroSection } from './hero-section';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    hero: sqHeroMessages.hero,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('HeroSection', () => {
  it('renders the approved membership-first public action hierarchy', () => {
    render(<HeroSection locale="sq" tenantId="tenant_ks" />);

    const hero = screen.getByTestId('public-entry-hero');
    expect(
      within(hero).getByRole('heading', {
        name: /Një mënyrë më e qartë për t’u përgatitur për atë që vjen më pas/i,
      })
    ).toBeInTheDocument();
    expect(within(hero).getAllByRole('link')).toHaveLength(3);
    expect(within(hero).getByTestId('public-entry-membership')).toHaveAttribute('href', '/pricing');
    expect(within(hero).getByTestId('public-entry-help-now')).toHaveAttribute('href', '/help-now');
    expect(within(hero).getByTestId('public-entry-case-organize')).toHaveAttribute(
      'href',
      '#free-start-intake'
    );
    expect(within(hero).queryByText(/4\.9|8[.,]500|100\s?%|24\/7/i)).not.toBeInTheDocument();
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
    expect(within(hero).queryByTestId('public-entry-membership')).not.toBeInTheDocument();
  });
});
