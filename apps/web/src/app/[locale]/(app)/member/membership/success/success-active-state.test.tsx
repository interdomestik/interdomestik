import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activeSubscription,
  renderSuccessPage,
  resetSuccessHarness,
  successMocks,
} from './success-page.test-harness';

const hoisted = successMocks();

describe('MembershipSuccessPage access-active regression', () => {
  beforeEach(() => {
    resetSuccessHarness();
    hoisted.getActiveSubscriptionMock.mockResolvedValue(activeSubscription);
  });
  afterEach(cleanup);

  it('preserves the entitled view despite hostile or stale query values', async () => {
    await renderSuccessPage({
      searchParams: { activation: 'pending', planId: 'forged', priceId: 'forged' },
    });

    expect(screen.getByText('membership.success.title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.status_active')).toBeInTheDocument();
    expect(screen.getByTestId('success-card')).toBeInTheDocument();
    expect(screen.getByTestId('membership-success-entity-disclosure')).toBeInTheDocument();
    expect(screen.getByText('membership.success.benefits_title')).toBeInTheDocument();
    expect(screen.getByText('membership.success.cta_start_claim')).toBeInTheDocument();
    expect(hoisted.funnelActivationTrackerMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );
  });

  it('preserves the classification note and stored subscription legal snapshot', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        id: 'member-1',
        name: 'Test Member',
        tenantId: 'tenant-ks',
        tenantClassificationPending: true,
      },
    });

    await renderSuccessPage({});

    expect(screen.getByText('membership.success.classification_note')).toBeInTheDocument();
    expect(screen.queryByText('membership.success.active_note')).not.toBeInTheDocument();
    expect(hoisted.successEntityDisclosureMock).toHaveBeenCalledWith(
      expect.objectContaining({ activeSubscription, tenantId: 'tenant-ks', locale: 'en' })
    );
  });

  it('keeps mock activation behind both test parameters and the runtime guard', async () => {
    const searchParams = { test: 'true', planId: 'standard', priceId: 'price-standard' };
    await renderSuccessPage({ searchParams });
    expect(hoisted.mockActivationTriggerMock).not.toHaveBeenCalled();
    cleanup();

    hoisted.isBillingTestActivationEnabledMock.mockReturnValue(true);
    await renderSuccessPage({ searchParams });
    expect(hoisted.mockActivationTriggerMock).toHaveBeenCalledWith({
      planId: 'standard',
      priceId: 'price-standard',
    });
  });
});
