import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ admit: vi.fn(), resolveTenant: vi.fn() }));
vi.mock('@/lib/tenant/public-admission-tenant', () => ({
  resolvePublicAdmissionTenant: m.resolveTenant,
}));
vi.mock('@/lib/tenant/public-intake-admission', () => ({ authorizeOpenPublicIntake: m.admit }));
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
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolveTenant.mockReturnValue('tenant_mk');
    m.admit.mockResolvedValue({});
  });

  it('offers just the admitted tenant while forwarding repeated hints for rejection', async () => {
    render(
      await Entry({
        params: Promise.resolve({ locale: 'de' }),
        searchParams: Promise.resolve({
          default_booking_tenant_id: ['pilot-mk', 'pilot-mk'],
          tenantId: 'tenant_ks',
        }),
      })
    );
    expect(m.admit).toHaveBeenCalledExactlyOnceWith('tenant_mk');
    expect(JSON.parse(screen.getByTestId('props').textContent!)).toEqual({
      locale: 'de',
      tenantOptions: ['tenant_mk'],
      bookingHints: ['pilot-mk', 'pilot-mk'],
    });
    expect(screen.getByTestId('business-membership-page-ready')).toBeInTheDocument();
  });

  it('keeps assisted contact available with no form when intake is closed', async () => {
    m.admit.mockResolvedValueOnce(null);
    render(await Entry({ params: Promise.resolve({ locale: 'de' }) }));
    expect(screen.queryByTestId('props')).not.toBeInTheDocument();
    expect(screen.getByText('businessLead.CLOSED')).toBeVisible();
    expect(screen.getByRole('link', { name: 'businessLead.callCta' })).toBeVisible();
  });
});
