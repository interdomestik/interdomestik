import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    admin: { title: 'Admin' },
  })),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

vi.mock('@/i18n/messages', () => ({
  BASE_NAMESPACES: ['common'],
  ADMIN_NAMESPACES: ['admin'],
  pickMessages: (messages: Record<string, unknown>) => messages,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: vi.fn(async () => ({
    user: { role: 'admin', tenantId: 't1', email: 'admin@example.com', name: 'Admin' },
  })),
  requireSessionOrRedirect: vi.fn((session: unknown) => session),
}));

vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminOrBranchManagerSession: vi.fn(async (session: unknown) => session),
}));

vi.mock('@/components/shell/authenticated-shell', () => ({
  AuthenticatedShell: ({
    children,
  }: {
    children: ReactNode;
    locale: string;
    messages: Record<string, unknown>;
  }) => children,
}));

vi.mock('@/components/admin/admin-sidebar', () => ({
  AdminSidebar: () => null,
}));

vi.mock('@/components/admin/admin-tenant-selector', () => ({
  AdminTenantSelector: () => null,
}));

vi.mock('@/components/dashboard/legacy-banner', () => ({
  LegacyBanner: () => null,
}));

vi.mock('@/components/dashboard/portal-surface-indicator', () => ({
  PortalSurfaceIndicator: () => null,
}));

vi.mock('@interdomestik/ui', () => ({
  Separator: () => null,
  SidebarInset: ({ children }: { children: ReactNode }) => children,
  SidebarProvider: ({ children }: { children: ReactNode; defaultOpen?: boolean }) => children,
  SidebarTrigger: () => null,
}));

import AdminLayout from './_core.entry';

describe('AdminLayout i18n initialization', () => {
  it('sets request locale before loading messages', async () => {
    await AdminLayout({
      children: null,
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getMessagesMock).toHaveBeenCalledTimes(1);
    expect(hoisted.setRequestLocaleMock.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.getMessagesMock.mock.invocationCallOrder[0]
    );
  });
});
