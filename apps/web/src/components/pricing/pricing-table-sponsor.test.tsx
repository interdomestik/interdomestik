import { checkoutConfig, mockPaddle, resetPricingTest } from './pricing-table-test-support';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingTable } from './pricing-table';

const mockCompanyOutlook = vi.hoisted(() => vi.fn());
vi.mock('@/app/[locale]/(app)/member/membership/leave-sponsorship.core', () => ({
  getCompanyMembershipOutlook: mockCompanyOutlook,
}));

const covering = { coverageEnd: new Date('2027-12-31T00:00:00Z') };

describe('PricingTable for a company-covered person (ACQ-3b)', () => {
  beforeEach(() => {
    resetPricingTest();
    mockCompanyOutlook.mockReset().mockResolvedValue({ ok: false });
  });

  it('shows the coverage notice and never opens checkout while sponsorship covers', async () => {
    mockCompanyOutlook.mockResolvedValue({ ok: true, outlook: { covering, nextStart: null } });
    render(<PricingTable userId="user-123" checkoutConfig={checkoutConfig} />);
    await waitFor(() => expect(mockCompanyOutlook).toHaveBeenCalled());
    const notice = await screen.findByTestId('pricing-sponsor-notice');
    expect(notice).toHaveTextContent('sponsorNotice.coveredUntil');
    fireEvent.click(screen.getByTestId('plan-cta-standard'));
    expect(screen.queryByTestId('pricing-precheckout-confirmation')).not.toBeInTheDocument();
    expect(mockPaddle.Checkout.open).not.toHaveBeenCalled();
    await waitFor(() => expect(notice).toHaveFocus());
  });

  it('keeps checkout for a later company start out of reach too', async () => {
    mockCompanyOutlook.mockResolvedValue({
      ok: true,
      outlook: { covering: null, nextStart: new Date('2027-09-01T00:00:00Z') },
    });
    render(<PricingTable userId="user-123" checkoutConfig={checkoutConfig} />);
    expect(await screen.findByTestId('pricing-sponsor-notice')).toHaveTextContent(
      'sponsorNotice.startsOn'
    );
  });

  it('does not ask anonymous visitors and shows no notice', () => {
    render(<PricingTable checkoutConfig={checkoutConfig} />);
    expect(mockCompanyOutlook).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pricing-sponsor-notice')).not.toBeInTheDocument();
  });
});
