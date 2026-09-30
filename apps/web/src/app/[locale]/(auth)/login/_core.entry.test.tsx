import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tenants } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTenantContext =
  | { kind: 'tenant'; tenantId: string; source: string }
  | { kind: 'public'; tenantId: null; source: string };

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => null),
  tenantRows: [{ id: 'tenant_ks', name: 'KS', countryCode: 'XK' }],
  adminSelectMock: vi.fn(),
  runtimeSelectMock: vi.fn(),
  activeOnlyMock: vi.fn(),
  tenantFromMock: vi.fn(),
  loginFormMock: vi.fn((_: unknown) => <div>login-form</div>),
  savedDraftSignInMock: vi.fn((_: unknown) => <div>saved-draft-sign-in</div>),
  redirectMock: vi.fn(),
  resolveTenantContextFromRequestMock: vi.fn<() => Promise<MockTenantContext>>(async () => ({
    kind: 'tenant',
    tenantId: 'tenant_ks',
    source: 'compatibility_alias',
  })),
  setRequestLocaleMock: vi.fn(),
  tenantSelectorMock: vi.fn((_: unknown) => <div>tenant-selector</div>),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `auth.login.${key}`),
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/components/auth/login-form', () => ({
  LoginForm: (props: unknown) => hoisted.loginFormMock(props),
}));

vi.mock('@/components/auth/tenant-selector', () => ({
  TenantSelector: (props: unknown) => hoisted.tenantSelectorMock(props),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafeMock,
}));

vi.mock('@/lib/canonical-routes', () => ({
  getCanonicalRouteForRole: vi.fn(() => null),
}));

vi.mock('@/lib/tenant/tenant-request', () => ({
  resolveTenantContextFromRequest: hoisted.resolveTenantContextFromRequestMock,
}));

vi.mock('./_core', async importOriginal => ({
  ...(await importOriginal<typeof import('./_core')>()),
  getLoginTenantBootstrapRedirect: vi.fn(() => null),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: { select: hoisted.runtimeSelectMock },
  dbAdmin: { select: hoisted.adminSelectMock },
}));

// The server entry has its own host/tenant tests; this renderer mounts its resolved boundary.
vi.mock('./saved-draft-sign-in', () => ({
  SavedDraftSignInEntry: (props: unknown) => hoisted.savedDraftSignInMock(props),
}));

import LoginPage from './_core.entry';

describe('LoginPage tenant selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafeMock.mockResolvedValue(null);
    hoisted.adminSelectMock.mockReturnValue({ from: hoisted.tenantFromMock });
    hoisted.tenantFromMock.mockReturnValue({ where: hoisted.activeOnlyMock });
    hoisted.activeOnlyMock.mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(hoisted.tenantRows),
    });
    // Staging RLS deliberately makes tenants invisible to the runtime role.
    hoisted.runtimeSelectMock.mockReturnValue({
      from: () => ({ where: () => ({ orderBy: async () => [] }) }),
    });
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValue({
      kind: 'tenant',
      tenantId: 'tenant_ks',
      source: 'compatibility_alias',
    });
  });

  it('renders the portal shell and resolves tenant context without rendering the chooser', async () => {
    const tree = await LoginPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByTestId('auth-ready')).toBeInTheDocument();
    expect(screen.getByTestId('auth-portal-hero')).toHaveTextContent(
      'auth.login.portal.panelTitle'
    );
    expect(screen.getByTestId('auth-portal-form-region')).toBeInTheDocument();
    expect(screen.queryByText('tenant-selector')).not.toBeInTheDocument();
    expect(hoisted.adminSelectMock).not.toHaveBeenCalled();
    expect(hoisted.runtimeSelectMock).not.toHaveBeenCalled();
    expect(screen.getByText('login-form')).toBeInTheDocument();
    expect(hoisted.savedDraftSignInMock).toHaveBeenCalledWith({ locale: 'en' });
    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_ks' })
    );
  });

  it.each(['en', 'sq', 'mk', 'sr'])(
    'renders active public tenant metadata despite runtime RLS denial in %s',
    async locale => {
      hoisted.resolveTenantContextFromRequestMock.mockResolvedValueOnce({
        kind: 'public',
        tenantId: null,
        source: 'ida_front_door',
      });

      const tree = await LoginPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({}),
      });

      render(tree);

      expect(hoisted.runtimeSelectMock).not.toHaveBeenCalled();
      expect(hoisted.adminSelectMock).toHaveBeenCalledWith({
        id: tenants.id,
        name: tenants.name,
        countryCode: tenants.countryCode,
      });
      expect(hoisted.activeOnlyMock).toHaveBeenCalledExactlyOnceWith(eq(tenants.isActive, true));
      expect(hoisted.setRequestLocaleMock).toHaveBeenCalledExactlyOnceWith(locale);
      expect(hoisted.tenantSelectorMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenants: hoisted.tenantRows })
      );
      expect(screen.getByTestId('auth-portal-form-region')).toContainElement(
        screen.getByText('tenant-selector')
      );
      expect(hoisted.tenantSelectorMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'auth.login.portal.tenantTitle' })
      );
      expect(hoisted.loginFormMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: undefined })
      );
    }
  );

  it('keeps the login form available when public tenant metadata cannot be loaded', async () => {
    const failure = new Error('tenant directory unavailable');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      hoisted.resolveTenantContextFromRequestMock.mockResolvedValueOnce({
        kind: 'public',
        tenantId: null,
        source: 'ida_front_door',
      });
      hoisted.adminSelectMock.mockImplementationOnce(() => {
        throw failure;
      });
      render(
        await LoginPage({
          params: Promise.resolve({ locale: 'sq' }),
          searchParams: Promise.resolve({}),
        })
      );
      expect(screen.getByText('login-form')).toBeInTheDocument();
      expect(hoisted.tenantSelectorMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenants: [] })
      );
      expect(hoisted.runtimeSelectMock).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith('Failed to load tenant options for login:', failure);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('keeps portal login copy available in every supported locale', () => {
    const expectedKeys = [
      'eyebrow',
      'title',
      'subtitle',
      'panelTitle',
      'panelBody',
      'chipSecure',
      'chipStatus',
      'chipDocuments',
      'tenantTitle',
      'formRegionLabel',
    ];

    for (const locale of ['en', 'sq', 'mk', 'sr']) {
      const file = readFileSync(join(process.cwd(), 'src/messages', locale, 'auth.json'), 'utf8');
      const messages = JSON.parse(file) as {
        auth?: { login?: { portal?: Record<string, string> } };
      };

      const sortAlphabetically = (a: string, b: string): number => a.localeCompare(b);

      expect(Object.keys(messages.auth?.login?.portal ?? {}).sort(sortAlphabetically)).toEqual(
        [...expectedKeys].sort(sortAlphabetically)
      );
    }
  });
});
