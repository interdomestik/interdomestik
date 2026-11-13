import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';

const h = vi.hoisted(() => ({
  shell: vi.fn(),
  session: vi.fn(() => Promise.resolve({ user: { id: 'agent-1', role: 'agent' } })),
  required: vi.fn(value => value),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  messages: vi.fn(() => Promise.resolve({})),
  pick: vi.fn(() => ({})),
  pass: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next-intl/server', () => ({
  getMessages: h.messages,
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock('next-intl', () => ({ NextIntlClientProvider: h.pass }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: h.session }));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: h.session,
  requireSessionOrRedirect: h.required,
}));
vi.mock('@/i18n/routing', () => ({ Link: h.pass, redirect: h.redirect }));
vi.mock('@/components/dashboard/claims/claims-filters', () => ({ ClaimsFilters: () => null }));
vi.mock('@/components/dashboard/claims/member-claims-table', () => ({
  MemberClaimsTable: () => null,
}));
vi.mock('@/components/shell/navigation-feedback', () => ({ NavigationFeedback: h.pass }));
vi.mock('@/i18n/messages', () => ({ APP_NAMESPACES: [], pickMessages: h.pick }));
vi.mock('@/components/shell/member-role-shell', () => ({
  MemberRoleShell: ({ children, ...props }: { children: React.ReactNode }) => {
    h.shell(props);
    return children;
  },
}));
vi.mock('@interdomestik/ui', () => ({ Button: h.pass }));

import DashboardLayout from './_core.entry';
import ClaimsPage from './claims/_core.entry';

describe('MemberDashboard layout role handling', () => {
  it('gives claims titles the mobile side gutter without doubling desktop padding', async () => {
    const { container } = render(await ClaimsPage({ params: Promise.resolve({ locale: 'sq' }) }));
    expect(container.querySelector('h2')?.parentElement?.parentElement).toHaveClass(
      'px-4',
      'md:px-0'
    );
  });

  it('gives document titles the same responsive side gutter', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'documents/_core.entry.tsx'), 'utf8');
    expect(source).toMatch(/<div className="px-4 md:px-0">\s*<h2/u);
  });
  it('gives the claims filters, phone cards and result count the same gutter', async () => {
    const { getByTestId } = render(await ClaimsPage({ params: Promise.resolve({ locale: 'sq' }) }));
    expect(getByTestId('member-claims-body')).toHaveClass('px-4', 'md:px-0');
    // Status chips reach 44px on phones from the wrapper, so the guarded filter unit stays unchanged.
    expect(getByTestId('member-claims-filters-targets')).toHaveClass(
      '[&_button]:min-h-11',
      '[&_button]:min-w-11',
      'sm:[&_button]:min-h-0',
      'sm:[&_button]:min-w-0'
    );
  });

  it('gives document claim cards and the empty state the same responsive gutter', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'documents/_core.entry.tsx'), 'utf8');
    expect(source).toMatch(/<div className="space-y-4 px-4 md:px-0">\s*\{userClaims\.map/u);
    expect(source).toContain(
      '<Card className="mx-4 md:mx-0" data-testid="member-documents-empty-state">'
    );
    expect(source).toContain('min-h-11 max-w-full whitespace-normal sm:min-h-9');
  });

  it.each(['en', 'sq', 'mk', 'sr', 'de'])('loads claims in %s', async locale => {
    await ClaimsPage({ params: Promise.resolve({ locale }) });

    expect(getTranslations).toHaveBeenCalledExactlyOnceWith({ locale, namespace: 'claims' });
  });

  it('requires the parent app layout to share the request-scoped session source', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../_core.entry.tsx'), 'utf8');
    expect(source).toContain('await getCachedSession()');
    expect(source).not.toMatch(/auth\.api\.getSession|from '@\/lib\/auth'/u);
  });

  it('renders agents through the unified member shell', async () => {
    const tree = await DashboardLayout({
      children: <div data-testid="member-dashboard-ready">Portal slots</div>,
      params: Promise.resolve({ locale: 'mk' }),
    });
    render(tree as React.ReactElement);

    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.shell).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: 'member' }) })
    );
    expect(document.querySelector('[data-testid="dashboard-page-ready"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="member-dashboard-ready"]')).toHaveTextContent(
      'Portal slots'
    );
  });

  it('redirects staff away before mounting the member shell', async () => {
    h.session.mockResolvedValueOnce({
      user: { id: 'staff-1', role: 'staff' },
    });
    await expect(
      DashboardLayout({ children: null, params: Promise.resolve({ locale: 'mk' }) })
    ).rejects.toThrow('redirect:/mk/staff');
  });
});
