import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectCoverageMatrix, getNamespacedTranslation } from '@/test/coverage-matrix-test-utils';
import { expectCommercialTerms } from '@/test/commercial-terms-test-utils';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers([['host', 'ks.localhost:3000']])),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'user-1',
      email: 'member@example.com',
    },
  })),
  pricingPageRuntimeMock: vi.fn((_: unknown) => null),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) =>
    getNamespacedTranslation(options)
  ),
}));

vi.mock('./pricing-page-runtime', () => ({
  PricingPageRuntime: (props: unknown) => hoisted.pricingPageRuntimeMock(props),
}));

vi.mock('@/components/pricing/pricing-table', () => ({
  PricingTable: ({ children }: { children?: ReactNode }) => children ?? null,
}));

import PricingPage from './_core.entry';

describe('PricingPage server shell', () => {
  it('does not read request headers or session data while rendering the pricing shell', async () => {
    const tree = await PricingPage({
      params: Promise.resolve({ locale: 'sq' }),
    });

    expect(tree).toBeTruthy();
    render(tree);

    expectCoverageMatrix({
      columnKey: 'coverageMatrix.columns.included',
      rowKey: 'coverageMatrix.rows.vehicle.title',
      sectionTestId: 'pricing-coverage-matrix',
    });
    expectCommercialTerms({ sectionTestId: 'pricing-billing-terms' });
    expect(screen.getByText('pricing.scope.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.guidance.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.outOfScope.title')).toBeInTheDocument();
    expect(screen.getByText('pricing.scope.boundary.title')).toBeInTheDocument();
    expect(hoisted.headersMock).not.toHaveBeenCalled();
    expect(hoisted.getSessionMock).not.toHaveBeenCalled();
  });
});
