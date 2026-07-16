import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activeSubscription,
  renderSuccessPage,
  resetSuccessHarness,
  successMocks,
} from './success-page.test-harness';

const hoisted = successMocks();

describe('MembershipSuccessPage registered-account state', () => {
  beforeEach(resetSuccessHarness);
  afterEach(cleanup);

  it('renders the direct null-subscription visit as a registered account without entitlement cues', async () => {
    await renderSuccessPage({});

    expect(screen.getByText('membership.success.registered_title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.registered_status')).toBeInTheDocument();
    expect(screen.getByText('membership.success.registered_body')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'membership.success.registered_primary_cta' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'membership.success.registered_secondary_cta' })
    ).toBeVisible();
    expect(screen.queryByTestId('success-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('membership-success-entity-disclosure')).not.toBeInTheDocument();
    expect(screen.queryByText('membership.success.benefits_title')).not.toBeInTheDocument();
    expect(screen.queryByText('membership.success.cta_start_claim')).not.toBeInTheDocument();
  });

  it('treats forged query and test-price values as non-authoritative when the runtime guard is off', async () => {
    await renderSuccessPage({
      searchParams: {
        activation: 'active',
        test: 'true',
        planId: 'forged-plan',
        priceId: 'forged-price',
      },
    });

    expect(screen.getByText('membership.success.registered_status')).toBeInTheDocument();
    expect(hoisted.mockActivationTriggerMock).not.toHaveBeenCalled();
    expect(screen.queryByText('membership.success.status_active')).not.toBeInTheDocument();
    expect(screen.queryByText('membership.success.cta_wallet')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'membership.success.registered_primary_cta' })
    ).not.toHaveAttribute('href', expect.stringMatching(/planId|priceId|test=/));
  });

  it('keeps a stale member-number session neutral when tenant-scoped subscription truth is absent', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        id: 'member-stale',
        name: 'Stale Member',
        tenantId: null,
        memberNumber: 'MEM-2026-999999',
      },
    });

    await renderSuccessPage({});

    expect(hoisted.getActiveSubscriptionMock).not.toHaveBeenCalled();
    expect(screen.getByText('membership.success.registered_status')).toBeInTheDocument();
    expect(screen.queryByText('MEM-2026-999999')).not.toBeInTheDocument();
    expect(screen.queryByText('membership.success.card_id_prefix')).not.toBeInTheDocument();
  });

  it('uses the same neutral truth for a simulated webhook-delayed return', async () => {
    await renderSuccessPage({ searchParams: { activation: 'pending' } });

    expect(screen.getByText('membership.success.registered_title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.registered_body')).toBeInTheDocument();
    expect(
      screen.queryByText('membership.success.activation_pending_body')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('membership.success.pending_subtitle')).not.toBeInTheDocument();
  });

  it('rechecks only canonical subscription truth and converges without checkout state', async () => {
    await renderSuccessPage({ searchParams: { check: '1' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'membership.success.registered_recheck_pending'
    );
    cleanup();

    hoisted.getActiveSubscriptionMock.mockResolvedValue(activeSubscription);
    await renderSuccessPage({ searchParams: { check: '1' } });

    expect(screen.getByRole('status')).toHaveTextContent(
      'membership.success.registered_recheck_active'
    );
    expect(hoisted.getActiveSubscriptionMock).toHaveBeenCalledTimes(2);
    expect(hoisted.mockActivationTriggerMock).not.toHaveBeenCalled();
  });

  it('redirects a no-session visit to the localized login route', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce(null);
    hoisted.redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(renderSuccessPage({ locale: 'mk' })).rejects.toThrow('redirect:/mk/login');
    expect(hoisted.redirectMock).toHaveBeenCalledWith('/mk/login');
  });
});
