import type { ReactNode } from 'react';
import enCommonMessages from '@/messages/en/common.json';
import enNavMessages from '@/messages/en/nav.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './header';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: createUseTranslationsMock(() => ({
    common: enCommonMessages.common,
    nav: enNavMessages.nav,
  })),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    locale,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
    locale?: string;
  }) => (
    <a href={href} data-locale={locale} {...props}>
      {children}
    </a>
  ),
}));

describe('Header', () => {
  it('keeps the public header calm: brand, locale, and sign-in only', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: /Interdomestik/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: enNavMessages.nav.login })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByRole('link', { name: /WhatsApp|\+383|\+389/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/60 seconds|60 sekonda|24\/7/i)).not.toBeInTheDocument();
    expect(document.querySelector('a button, button a')).not.toBeInTheDocument();
  });

  it('opens a real four-locale control with 44px targets', () => {
    render(<Header />);

    const toggle = screen.getByRole('button', { name: enNavMessages.nav.language });
    expect(toggle).toHaveClass('min-h-11');
    fireEvent.click(toggle);

    const localeLinks = screen.getAllByTestId('public-locale-option');
    expect(localeLinks).toHaveLength(4);
    expect(localeLinks.map(link => link.getAttribute('data-locale'))).toEqual([
      'sq',
      'en',
      'sr',
      'mk',
    ]);
    expect(localeLinks.every(link => link.className.includes('min-h-11'))).toBe(true);
  });
});
