import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dashboardSidebarMock: vi.fn(() => null),
  dashboardHeaderMock: vi.fn(() => null),
  legacyBannerMock: vi.fn(() => null),
  getSessionSafeMock: vi.fn(async () => ({
    user: {
      id: 'agent-1',
      role: 'agent',
    },
  })),
  requireSessionOrRedirectMock: vi.fn(session => session),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getMessagesMock: vi.fn(async () => ({})),
  pickMessagesMock: vi.fn(() => ({})),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  setRequestLocale: vi.fn(),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
  requireSessionOrRedirect: hoisted.requireSessionOrRedirectMock,
}));

vi.mock('@/components/shell/navigation-feedback', () => ({
  NavigationFeedback: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/i18n/messages', () => ({
  APP_NAMESPACES: [],
  pickMessages: hoisted.pickMessagesMock,
}));

vi.mock('@interdomestik/ui', () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => children,
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/dashboard/dashboard-header', () => ({
  DashboardHeader: hoisted.dashboardHeaderMock,
}));

vi.mock('@/components/dashboard/dashboard-sidebar', () => ({
  DashboardSidebar: hoisted.dashboardSidebarMock,
}));

vi.mock('@/components/dashboard/legacy-banner', () => ({
  LegacyBanner: hoisted.legacyBannerMock,
}));

import DashboardLayout from './_core.entry';

describe('MemberDashboard layout role handling', () => {
  it('allows agents to render the unified member shell', async () => {
    const tree = await DashboardLayout({
      children: <div data-testid="child-content" />,
      params: Promise.resolve({ locale: 'mk' }),
    });

    expect(tree).not.toBeNull();
    expect(hoisted.redirectMock).not.toHaveBeenCalled();
  });

  it('exercises member scope for an agent entering the member shell', async () => {
    const tree = await DashboardLayout({
      children: <div data-testid="child-content" />,
      params: Promise.resolve({ locale: 'mk' }),
    });
    render(tree as React.ReactElement);

    expect(hoisted.dashboardSidebarMock).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: 'member' }) }),
      undefined
    );
    expect(hoisted.dashboardHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: 'member' }) }),
      undefined
    );
    expect(hoisted.legacyBannerMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
      undefined
    );
  });
});
