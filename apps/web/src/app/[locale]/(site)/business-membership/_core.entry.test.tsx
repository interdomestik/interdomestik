import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ options: vi.fn() }));
vi.mock('@/lib/tenant/public-onboarding-tenants.server', () => ({
  loadPublicOnboardingTenants: m.options,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/components/pricing/business-lead-form', () => ({
  BusinessLeadForm: (props: unknown) => <pre data-testid="props">{JSON.stringify(props)}</pre>,
}));
vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({ telHref: 'tel:123', whatsappHref: 'https://wa.me/123' }),
}));
import Entry from './_core.entry';
describe('business entry classification wiring', () => {
  it('passes the active roster and every repeated query hint without classifying by locale', async () => {
    m.options.mockResolvedValue(['tenant_mk', 'pilot-mk']);
    render(
      await Entry({
        params: Promise.resolve({ locale: 'de' }),
        searchParams: Promise.resolve({
          default_booking_tenant_id: ['pilot-mk', 'pilot-mk'],
          tenantId: 'tenant_ks',
        }),
      })
    );
    expect(JSON.parse(screen.getByTestId('props').textContent!)).toEqual({
      locale: 'de',
      tenantOptions: ['tenant_mk', 'pilot-mk'],
      bookingHints: ['pilot-mk', 'pilot-mk'],
    });
    expect(screen.getByTestId('business-membership-page-ready')).toBeInTheDocument();
  });
});
