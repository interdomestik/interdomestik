import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTenantContext =
  | { kind: 'tenant'; tenantId: string; source: string }
  | { kind: 'public'; tenantId: null; source: string };

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => null),
  loadTenantOptionsMock: vi.fn(async () => [{ id: 'tenant_ks', name: 'KS', countryCode: 'XK' }]),
  loginFormMock: vi.fn((_: unknown) => <div>login-form</div>),
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

vi.mock('./_core', () => ({
  getLoginTenantBootstrapRedirect: vi.fn(() => null),
  loadTenantOptions: () => hoisted.loadTenantOptionsMock(),
}));

import LoginPage from './_core.entry';

describe('LoginPage tenant selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafeMock.mockResolvedValue(null);
    hoisted.loadTenantOptionsMock.mockResolvedValue([
      { id: 'tenant_ks', name: 'KS', countryCode: 'XK' },
    ]);
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
    expect(screen.getByText('login-form')).toBeInTheDocument();
    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_ks' })
    );
  });

  it('renders the tenant chooser inside the portal form region for public ida context', async () => {
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValueOnce({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });

    const tree = await LoginPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByTestId('auth-portal-form-region')).toContainElement(
      screen.getByText('tenant-selector')
    );
    expect(hoisted.tenantSelectorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'auth.login.portal.tenantTitle' })
    );
    expect(hoisted.loginFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined })
    );
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
