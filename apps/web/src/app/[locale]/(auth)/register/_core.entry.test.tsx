import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  ascMock: vi.fn(),
  eqMock: vi.fn(),
  getTranslationsMock: vi.fn(async (options?: { namespace?: string } | string) => {
    const namespace =
      typeof options === 'string'
        ? `${options}.`
        : options?.namespace
          ? `${options.namespace}.`
          : '';
    return (key: string) => `${namespace}${key}`;
  }),
  registerFormMock: vi.fn((_: unknown) => <div>register-form</div>),
  resolveTenantIdFromRequestMock: vi.fn(async () => 'tenant_ks'),
  selectMock: vi.fn(() => ({
    from: () => ({
      where: () => ({
        orderBy: async () => [],
      }),
    }),
  })),
  setRequestLocaleMock: vi.fn(),
  tenantSelectorMock: vi.fn((_: unknown) => <div>tenant-selector</div>),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/components/auth/register-form', () => ({
  RegisterForm: (props: unknown) => hoisted.registerFormMock(props),
}));

vi.mock('@/components/auth/tenant-selector', () => ({
  TenantSelector: (props: unknown) => hoisted.tenantSelectorMock(props),
}));

vi.mock('@/lib/tenant/tenant-request', () => ({
  resolveTenantIdFromRequest: hoisted.resolveTenantIdFromRequestMock,
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  tenants: {
    countryCode: 'tenants.country_code',
    id: 'tenants.id',
    isActive: 'tenants.is_active',
    name: 'tenants.name',
  },
}));

vi.mock('drizzle-orm', () => ({
  asc: hoisted.ascMock,
  eq: hoisted.eqMock,
}));

import RegisterPage from './_core.entry';

describe('RegisterPage commercial coverage matrix', () => {
  it('renders the shared coverage matrix alongside the checkout form', async () => {
    const tree = await RegisterPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ tenantId: 'tenant_ks' }),
    });

    render(tree);

    const coverageMatrix = screen.getByTestId('register-coverage-matrix');

    expect(within(coverageMatrix).getByText('coverageMatrix.title')).toBeInTheDocument();
    expect(within(coverageMatrix).getAllByText('coverageMatrix.rows.vehicle.title').length).toBe(2);
    expect(within(coverageMatrix).getAllByText('coverageMatrix.columns.escalation').length).toBe(6);
    expect(screen.getByText('register-form')).toBeInTheDocument();
    expect(hoisted.resolveTenantIdFromRequestMock).toHaveBeenCalledWith({
      tenantIdFromQuery: 'tenant_ks',
    });
  });
});
