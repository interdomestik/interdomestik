import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
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

vi.mock('@/i18n/messages', () => ({
  APP_NAMESPACES: [],
  pickMessages: hoisted.pickMessagesMock,
}));

vi.mock('@interdomestik/ui', () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => children,
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/dashboard/dashboard-header', () => ({
  DashboardHeader: () => null,
}));

vi.mock('@/components/dashboard/dashboard-sidebar', () => ({
  DashboardSidebar: () => null,
}));

vi.mock('@/components/dashboard/legacy-banner', () => ({
  LegacyBanner: () => null,
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
});
