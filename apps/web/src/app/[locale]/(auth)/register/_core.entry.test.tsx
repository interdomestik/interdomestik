import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';
import { expectSuccessFeeCalculator } from '@/test/success-fee-calculator-test-utils';

const hoisted = vi.hoisted(() => ({
  registerFormMock: vi.fn((_: unknown) => <div>register-form</div>),
  resolveTenantContextFromRequestMock: vi.fn<
    (...args: unknown[]) => Promise<{ tenantId: string; source: string } | null>
  >(async () => ({ tenantId: 'tenant_ks', source: 'default_public' })),
  setRequestLocaleMock: vi.fn(),
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

vi.mock('@/lib/tenant/tenant-request', () => ({
  resolveTenantContextFromRequest: hoisted.resolveTenantContextFromRequestMock,
}));

import RegisterPage from './_core.entry';

describe('RegisterPage commercial coverage matrix', () => {
  it('resolves tenant context without rendering the chooser', async () => {
    const tree = await RegisterPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.queryByText('tenant-selector')).not.toBeInTheDocument();
    expect(screen.getByText('register-form')).toBeInTheDocument();
    expect(hoisted.registerFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_ks', tenantClassificationPending: true })
    );
  });

  it('keeps the form chooser-free even when tenant resolution returns no context', async () => {
    hoisted.resolveTenantContextFromRequestMock.mockResolvedValueOnce(null);

    const tree = await RegisterPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(tree);

    expect(screen.queryByText('tenant-selector')).not.toBeInTheDocument();
    expect(hoisted.registerFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_ks', tenantClassificationPending: true })
    );
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
    expect(hoisted.resolveTenantContextFromRequestMock).toHaveBeenCalledWith({
      tenantIdFromQuery: 'tenant_ks',
    });
  });
});
