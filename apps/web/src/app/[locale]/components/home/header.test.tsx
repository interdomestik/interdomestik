import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import enCommonMessages from '@/messages/en/common.json';
import enHeroMessages from '@/messages/en/hero.json';
import enNavMessages from '@/messages/en/nav.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { Header } from './header';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    common: enCommonMessages.common,
    hero: enHeroMessages.hero,
    nav: enNavMessages.nav,
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

vi.mock('@/lib/contact', () => ({
  contactInfo: {
    phone: '+383 49 900 600',
    telHref: 'tel:+38349900600',
    whatsapp: 'https://wa.me/38349900600',
  },
}));

describe('Header', () => {
  it('routes desktop and mobile primary entry points to Free Start with 44px mobile targets', () => {
    render(<Header />);

    expect(screen.getAllByRole('link', { name: enHeroMessages.hero.callNow })[0]).toHaveAttribute(
      'href',
      '#free-start-intake'
    );
    expect(
      screen
        .getAllByRole('link', { name: '+383 49 900 600' })
        .some(link => link.className.includes('h-11 w-11'))
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: enNavMessages.nav.toggleMenu }));

    expect(screen.getAllByRole('link', { name: enHeroMessages.hero.callNow })[1]).toHaveAttribute(
      'href',
      '#free-start-intake'
    );
  });
});
