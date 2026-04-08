import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import enCommonMessages from '@/messages/en/common.json';
import enNavMessages from '@/messages/en/nav.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { Header } from './header';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    common: enCommonMessages.common,
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
    whatsapp: 'https://wa.me/38349900600',
  },
}));

describe('Header', () => {
  it('routes desktop and mobile sign-up entry points to pricing', () => {
    render(<Header />);

    expect(screen.getAllByRole('link', { name: enNavMessages.nav.register })[0]).toHaveAttribute(
      'href',
      '/pricing'
    );

    fireEvent.click(screen.getByRole('button', { name: enNavMessages.nav.toggleMenu }));

    expect(screen.getAllByRole('link', { name: enNavMessages.nav.register })[1]).toHaveAttribute(
      'href',
      '/pricing'
    );
  });
});
