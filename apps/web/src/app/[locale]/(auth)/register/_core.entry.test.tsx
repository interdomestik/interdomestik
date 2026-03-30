import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { expectSuccessFeeCalculator } from '@/test/success-fee-calculator-test-utils';

const hoisted = vi.hoisted(() => ({
  ascMock: vi.fn(),
  eqMock: vi.fn(),
  registerFormMock: vi.fn((_: unknown) => <div>register-form</div>),
  resolveTenantIdFromRequestMock: vi.fn(async () => 'tenant_ks'),
  selectMock: vi.fn(),
  setRequestLocaleMock: vi.fn(),
  tenantSelectorMock: vi.fn((_: unknown) => <div>tenant-selector</div>),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
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
  it('renders tenant selector when tenant context is unresolved', async () => {
    hoisted.resolveTenantIdFromRequestMock.mockResolvedValueOnce(null);

    const tree = await RegisterPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.getByText('tenant-selector')).toBeInTheDocument();
    expect(screen.getByText('register-form')).toBeInTheDocument();
  });

  it('renders the shared coverage matrix alongside the checkout form', async () => {
    const tree = await RegisterPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ tenantId: 'tenant_ks' }),
    });

    render(tree);

    expectCoverageMatrix({
      columnKey: 'coverageMatrix.columns.escalation',
      rowKey: 'coverageMatrix.rows.vehicle.title',
      sectionTestId: 'register-coverage-matrix',
    });
    expectSuccessFeeCalculator({ sectionTestId: 'register-success-fee-calculator' });
    expectCommercialTerms({ sectionTestId: 'register-billing-terms' });
    expect(screen.getByText('register-form')).toBeInTheDocument();
    expect(hoisted.resolveTenantIdFromRequestMock).toHaveBeenCalledWith({
      tenantIdFromQuery: 'tenant_ks',
    });
  });
});
