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
    render(
      <main>
        <Header />
      </main>
    );

    expect(screen.getByRole('link', { name: /Interdomestik/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: enNavMessages.nav.login })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByRole('link', { name: /WhatsApp|\+383|\+389/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/60 seconds|60 sekonda|24\/7/i)).not.toBeInTheDocument();
    expect(document.querySelector('a button, button a')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-header')).not.toHaveAttribute('role');
  });

  it('opens a real four-locale control with 44px targets', () => {
    render(<Header />);

    const toggle = screen.getByRole('button', { name: enNavMessages.nav.language });
    expect(toggle).toHaveAttribute('data-testid', 'public-locale-trigger');
    expect(toggle).toHaveClass('min-h-11');
    expect(toggle).toHaveAttribute('aria-controls', 'public-locale-options');
    expect(toggle).not.toHaveAttribute('aria-haspopup');
    fireEvent.click(toggle);

    const localeLinks = screen.getAllByTestId('public-locale-option');
    const localeOptions = document.getElementById('public-locale-options');
    expect(localeOptions).toHaveClass('right-0');
    expect(localeOptions?.parentElement).toContainElement(toggle);
    expect(localeLinks).toHaveLength(4);
    expect(localeLinks.map(link => link.getAttribute('data-locale'))).toEqual([
      'sq',
      'en',
      'sr',
      'mk',
    ]);
    expect(localeLinks.every(link => link.className.includes('min-h-11'))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(localeLinks.every(link => !link.hasAttribute('role'))).toBe(true);
    const orderedActions = [...screen.getByTestId('public-header').querySelectorAll('a,button')];
    expect(orderedActions).toEqual([
      screen.getByRole('link', { name: 'Interdomestik' }),
      toggle,
      ...localeLinks,
      screen.getByRole('link', { name: enNavMessages.nav.login }),
    ]);
    expect(orderedActions.every(action => action.className.includes('forced-colors:outline'))).toBe(
      true
    );

    for (let index = 0; index < 4; index += 1) {
      if (index > 0) fireEvent.click(toggle);
      const option = screen.getAllByTestId('public-locale-option')[index];
      option.focus();
      fireEvent.keyDown(option, { key: 'Escape' });
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: 'Escape' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses local wrapping and compact targets without masking document overflow', () => {
    render(
      <main>
        <Header />
      </main>
    );

    const header = screen.getByTestId('public-header');
    const shell = header.firstElementChild;
    const brand = screen.getByRole('link', { name: 'Interdomestik' });
    const language = screen.getByRole('button', { name: enNavMessages.nav.language });
    const login = screen.getByRole('link', { name: enNavMessages.nav.login });

    expect(shell).toHaveClass('flex-wrap');
    expect(brand).toHaveClass('min-w-11');
    expect(language).toHaveClass('min-w-11');
    expect(login).toHaveClass('min-w-11');
    expect(header.className).not.toMatch(/overflow-x-hidden|overflow-hidden|\bclip\b/);
  });
});
