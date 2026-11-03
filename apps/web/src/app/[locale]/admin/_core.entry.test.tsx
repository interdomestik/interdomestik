import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMessagesMock: vi.fn(async () => ({
    common: { loading: 'Loading' },
    admin: { title: 'Admin', sidebar: { title: 'Localized Admin Shell' } },
  })),
  getTranslationsMock: vi.fn(
    async () => (key: string) => ({ title: 'Localized Admin Shell' })[key] ?? key
  ),
  setRequestLocaleMock: vi.fn(),
  session: {
    user: { role: 'admin', tenantId: 't1', email: 'admin@example.com', name: 'Admin' },
  } as { user: Record<string, unknown> },
  authorizeSessionTenantMock: vi.fn(),
  listSuperAdminTenantOptionsMock: vi.fn(),
  tenantSelectorProps: [] as unknown[],
}));

vi.mock('next-intl/server', () => ({
  getMessages: hoisted.getMessagesMock,
  getTranslations: hoisted.getTranslationsMock,
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
  getSessionSafe: vi.fn(async () => hoisted.session),
  requireSessionOrRedirect: vi.fn((session: unknown) => session),
}));

vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrNotFound: vi.fn(async () => undefined),
}));

vi.mock('@/components/shell/authenticated-shell', () => ({
  AuthenticatedShell: ({
    children,
  }: {
    children: ReactNode;
    locale: string;
    messages: Record<string, unknown>;
    enableNavigationFeedback?: boolean;
  }) => children,
}));

vi.mock('@/components/shell/navigation-feedback', () => ({
  NavigationFeedback: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/admin/admin-sidebar', () => ({
  AdminSidebar: () => null,
}));

vi.mock('@/components/admin/admin-tenant-selector', () => ({
  AdminTenantSelector: (props: unknown) => {
    hoisted.tenantSelectorProps.push(props);
    return null;
  },
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenantMock,
}));

vi.mock('@interdomestik/database', () => ({
  listSuperAdminTenantOptions: hoisted.listSuperAdminTenantOptionsMock,
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

  it('renders the localized admin shell title', async () => {
    const view = await AdminLayout({
      children: null,
      params: Promise.resolve({ locale: 'mk' }),
    });

    expect(renderToStaticMarkup(view)).toContain('Localized Admin Shell');
  });

  it('renders the admin readiness marker at the layout boundary', async () => {
    const view = await AdminLayout({
      children: null,
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(renderToStaticMarkup(view)).toContain('data-testid="admin-page-ready"');
  });
});

describe('AdminLayout super-admin tenant selector', () => {
  it('lists tenant options through the super admin session authority', async () => {
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    const authority = mintTestTenantAuthority('t1');
    const options = [{ id: 'tenant_ks', name: 'Kosovo', countryCode: 'XK' }];
    hoisted.session = {
      user: { role: 'super_admin', tenantId: 't1', email: 'sa@example.com', name: 'SA' },
    };
    hoisted.authorizeSessionTenantMock.mockResolvedValue({ session: hoisted.session, authority });
    hoisted.listSuperAdminTenantOptionsMock.mockResolvedValue(options);
    hoisted.tenantSelectorProps.length = 0;

    const view = await AdminLayout({ children: null, params: Promise.resolve({ locale: 'en' }) });
    renderToStaticMarkup(view);

    expect(hoisted.listSuperAdminTenantOptionsMock).toHaveBeenCalledTimes(1);
    expect(hoisted.listSuperAdminTenantOptionsMock.mock.calls[0][0]).toBe(authority);
    expect(hoisted.tenantSelectorProps).toContainEqual(
      expect.objectContaining({ tenants: options })
    );
  });

  it('never lists tenants for a non-super-admin and degrades to none on failure', async () => {
    hoisted.listSuperAdminTenantOptionsMock.mockClear();
    hoisted.session = {
      user: { role: 'admin', tenantId: 't1', email: 'admin@example.com', name: 'Admin' },
    };
    await AdminLayout({ children: null, params: Promise.resolve({ locale: 'en' }) });
    expect(hoisted.listSuperAdminTenantOptionsMock).not.toHaveBeenCalled();

    hoisted.session = {
      user: { role: 'super_admin', tenantId: 't1', email: 'sa@example.com', name: 'SA' },
    };
    hoisted.authorizeSessionTenantMock.mockResolvedValue(null);
    await expect(
      AdminLayout({ children: null, params: Promise.resolve({ locale: 'en' }) })
    ).resolves.toBeTruthy();
    expect(hoisted.listSuperAdminTenantOptionsMock).not.toHaveBeenCalled();
  });
});
