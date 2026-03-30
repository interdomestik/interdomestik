import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionSafeMock: vi.fn(async () => null),
  loadTenantOptionsMock: vi.fn(async () => [{ id: 'tenant_ks', name: 'KS', countryCode: 'XK' }]),
  loginFormMock: vi.fn((_: unknown) => <div>login-form</div>),
  redirectMock: vi.fn(),
  resolveTenantIdFromRequestMock: vi.fn(async () => null),
  setRequestLocaleMock: vi.fn(),
  tenantSelectorMock: vi.fn((_: unknown) => <div>tenant-selector</div>),
}));

vi.mock('next-intl/server', () => ({
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
  resolveTenantIdFromRequest: hoisted.resolveTenantIdFromRequestMock,
}));

vi.mock('./_core', () => ({
  getLoginTenantBootstrapRedirect: vi.fn(() => null),
  loadTenantOptions: (args: unknown) => hoisted.loadTenantOptionsMock(args),
}));

import LoginPage from './_core.entry';

describe('LoginPage tenant selection', () => {
  it('renders tenant selector when tenant context is unresolved', async () => {
    const tree = await LoginPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByText('tenant-selector')).toBeInTheDocument();
    expect(screen.getByText('login-form')).toBeInTheDocument();
  });
});
