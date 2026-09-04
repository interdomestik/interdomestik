import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// prettier-ignore
const h = vi.hoisted(() => ({ sidebar: vi.fn(() => null), header: vi.fn(() => null), session: vi.fn(async () => ({ user: { id: 'agent-1', role: 'agent' } })), required: vi.fn(value => value), redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }), messages: vi.fn(async () => ({})), pick: vi.fn(() => ({})), pass: ({ children }: { children: React.ReactNode }) => children }));

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next-intl/server', () => ({ getMessages: h.messages, setRequestLocale: vi.fn() }));
vi.mock('next-intl', () => ({ NextIntlClientProvider: h.pass }));
vi.mock('@/lib/auth.server', () => ({ getCachedSession: h.session }));
vi.mock('@/components/shell/session', () => ({ requireSessionOrRedirect: h.required }));
vi.mock('@/components/shell/navigation-feedback', () => ({ NavigationFeedback: h.pass }));
vi.mock('@/i18n/messages', () => ({ APP_NAMESPACES: [], pickMessages: h.pick }));
vi.mock('@interdomestik/ui', () => ({ SidebarInset: h.pass, SidebarProvider: h.pass }));
vi.mock('@/components/dashboard/dashboard-header', () => ({ DashboardHeader: h.header }));
vi.mock('@/components/dashboard/dashboard-sidebar', () => ({ DashboardSidebar: h.sidebar }));

import DashboardLayout from './_core.entry';

describe('MemberDashboard layout role handling', () => {
  it('requires the parent app layout to share the request-scoped session source', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../_core.entry.tsx'), 'utf8');
    expect(source).toContain('await getCachedSession()');
    expect(source).not.toMatch(/auth\.api\.getSession|from '@\/lib\/auth'/u);
  });

  it('renders agents through the unified member shell', async () => {
    const tree = await DashboardLayout({
      children: <div />,
      params: Promise.resolve({ locale: 'mk' }),
    });
    render(tree as React.ReactElement);

    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.sidebar).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: 'member' }) }),
      undefined
    );
    expect(h.header).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: 'member' }) }),
      undefined
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
