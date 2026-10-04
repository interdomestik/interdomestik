import type { ReactNode } from 'react';
import enCommonMessages from '@/messages/en/common.json';
import enNavMessages from '@/messages/en/nav.json';
import mkNavMessages from '@/messages/mk/nav.json';
import sqNavMessages from '@/messages/sq/nav.json';
import srNavMessages from '@/messages/sr/nav.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './header';

const h = vi.hoisted(() => ({
  locale: 'en' as string,
  useSession: vi.fn(),
}));

type HeaderNavCatalog = { language: string; login: string; myAccount: string };

// Only the keys this header reads, so a locale catalog is checked for exactly those.
const navCatalogs: Record<string, HeaderNavCatalog> = {
  sq: sqNavMessages.nav,
  en: enNavMessages.nav,
  sr: srNavMessages.nav,
  mk: mkNavMessages.nav,
};

vi.mock('next-intl', () => ({
  useLocale: () => h.locale,
  useTranslations: createUseTranslationsMock(() => ({
    common: enCommonMessages.common,
    nav: navCatalogs[h.locale],
  })),
}));

vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: h.useSession } }));

// The mocked client Link carries `data-client-link`, so a test can tell a client-side transition
// apart from the native, full-document anchor the auth action must stay.
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
    <a href={href} data-client-link="true" data-locale={locale} {...props}>
      {children}
    </a>
  ),
}));

function setSession(data: unknown, isPending = false) {
  h.useSession.mockReturnValue({ data, isPending });
}

function signedInAs(role: string) {
  return { user: { id: 'user-1', role } };
}

function authAction() {
  return screen.getByTestId('public-auth-action');
}

beforeEach(() => {
  h.locale = 'en';
  setSession(null);
});

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
      '/en/login'
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
    expect(
      orderedActions.every(action =>
        action.className.includes('forced-colors:focus-visible:outline')
      )
    ).toBe(true);

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

  it('leaves the auth action a native anchor while the rest of the header stays client-routed', () => {
    setSession(signedInAs('member'));
    render(<Header />);

    const toggle = screen.getByRole('button', { name: enNavMessages.nav.language });
    fireEvent.click(toggle);

    const action = authAction();
    expect(action.tagName).toBe('A');
    expect(action).not.toHaveAttribute('data-client-link');
    expect(action).not.toHaveAttribute('target');
    expect(action.getAttribute('href')).toBe('/en/member');
    expect(screen.getByRole('link', { name: 'Interdomestik' })).toHaveAttribute(
      'data-client-link',
      'true'
    );
    expect(
      screen
        .getAllByTestId('public-locale-option')
        .every(link => link.getAttribute('data-client-link') === 'true')
    ).toBe(true);
  });

  it('keeps the login door for anonymous visitors and for a session that has not settled', () => {
    const { rerender } = render(<Header />);
    expect(authAction()).toHaveAttribute('href', '/en/login');
    expect(authAction()).toHaveTextContent(enNavMessages.nav.login);

    setSession(null, true);
    rerender(<Header />);
    expect(authAction()).toHaveAttribute('href', '/en/login');

    // A refresh in flight must not promise a portal it cannot name yet.
    setSession(signedInAs('member'), true);
    rerender(<Header />);
    expect(authAction()).toHaveAttribute('href', '/en/login');
    expect(authAction()).toHaveTextContent(enNavMessages.nav.login);
  });

  it.each([
    { role: 'member', expected: '/en/member' },
    { role: 'user', expected: '/en/member' },
    { role: 'agent', expected: '/en/agent' },
    { role: 'staff', expected: '/en/staff/claims' },
    { role: 'admin', expected: '/en/admin/overview' },
    { role: 'tenant_admin', expected: '/en/admin/overview' },
    { role: 'super_admin', expected: '/en/admin/overview' },
    { role: 'branch_manager', expected: '/en/admin/overview' },
  ])('sends a signed-in $role to its canonical portal', ({ role, expected }) => {
    setSession(signedInAs(role));
    render(<Header />);

    const action = authAction();
    expect(action).toHaveAttribute('href', expected);
    expect(action).toHaveTextContent(enNavMessages.nav.myAccount);
    expect(action).toHaveClass('min-h-11', 'min-w-11', 'forced-colors:focus-visible:outline');
  });

  it.each(['promoter', 'auditor', 'global_support', 'not-a-role'])(
    'keeps the login door for the unsupported role %s',
    role => {
      setSession(signedInAs(role));
      render(<Header />);

      expect(authAction()).toHaveAttribute('href', '/en/login');
      expect(authAction()).toHaveTextContent(enNavMessages.nav.login);
    }
  );

  it.each(['sq', 'en', 'sr', 'mk'])('qualifies both destinations once for %s', locale => {
    const catalog = navCatalogs[locale];
    h.locale = locale;

    const { rerender } = render(<Header />);
    expect(authAction()).toHaveAttribute('href', `/${locale}/login`);
    expect(authAction()).toHaveTextContent(catalog.login);

    setSession(signedInAs('member'));
    rerender(<Header />);
    // A real catalog entry, not the mock's missing-key fallback.
    expect(catalog.myAccount).not.toBe('myAccount');
    expect(authAction()).toHaveTextContent(catalog.myAccount);
    expect(authAction()).toHaveAttribute('href', `/${locale}/member`);
    expect(authAction().getAttribute('href')).not.toMatch(/^\/(sq|en|sr|mk)\/(sq|en|sr|mk)\//);
  });

  it('returns to the login door when the member signs out', () => {
    setSession(signedInAs('member'));
    const { rerender } = render(<Header />);
    expect(authAction()).toHaveAttribute('href', '/en/member');
    expect(authAction()).toHaveTextContent(enNavMessages.nav.myAccount);

    setSession(null);
    rerender(<Header />);
    expect(authAction()).toHaveAttribute('href', '/en/login');
    expect(authAction()).toHaveTextContent(enNavMessages.nav.login);
  });
});
