import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSubscriptionEntityDisclosureCoreMock: vi.fn(async () => ({
    contractingCompany: 'Interdomestik KS LLC',
    governingLaw: 'XK',
    unavailable: false,
    source: 'subscription',
  })),
  getTenantEntityDisclosureCoreMock: vi.fn(async () => ({
    contractingCompany: null,
    governingLaw: null,
    unavailable: true,
    source: 'tenant',
  })),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (options?: { namespace?: string } | string) => {
    const namespace = typeof options === 'string' ? options : options?.namespace;
    return (key: string) => `${namespace}.${key}`;
  }),
}));

vi.mock('@/lib/entity-disclosure.core', () => ({
  getSubscriptionEntityDisclosureCore: hoisted.getSubscriptionEntityDisclosureCoreMock,
  getTenantEntityDisclosureCore: hoisted.getTenantEntityDisclosureCoreMock,
}));

import { SuccessEntityDisclosure } from './success-entity-disclosure';

describe('SuccessEntityDisclosure', () => {
  it('renders subscription entity disclosure when an active subscription exists', async () => {
    const tree = await SuccessEntityDisclosure({
      activeSubscription: {
        tenantId: 'tenant_ks',
        legalTenantId: null,
        governingLawSnapshot: null,
      },
      tenantId: 'tenant_ks',
      locale: 'en',
    });

    render(tree);

    expect(screen.getByTestId('membership-success-entity-disclosure')).toHaveTextContent(
      'Interdomestik KS LLC'
    );
    expect(screen.getByText('XK')).toBeInTheDocument();
    expect(hoisted.getTenantEntityDisclosureCoreMock).not.toHaveBeenCalled();
  });
});
