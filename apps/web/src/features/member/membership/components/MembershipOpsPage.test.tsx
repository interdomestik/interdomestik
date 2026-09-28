import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MembershipOpsPage,
  actionMocks,
  selectionMocks,
  routerMocks,
  originalConfirm,
  setupMembershipOpsPageHarness,
} from './__tests__/membership-ops-page-harness';

describe('MembershipOpsPage', () => {
  setupMembershipOpsPageHarness();

  it('shows scope and referral boundaries alongside membership operations', () => {
    render(<MembershipOpsPage subscriptions={[]} documents={[]} />);

    expect(screen.getByTestId('membership-commercial-disclaimers')).toBeInTheDocument();
    expect(screen.getByText('disclaimers.freeStart.title')).toBeInTheDocument();
    expect(screen.getByText('disclaimers.hotline.title')).toBeInTheDocument();
    expect(screen.getByText('scope.title')).toBeInTheDocument();
    expect(screen.getByText('scope.guidance.title')).toBeInTheDocument();
    expect(screen.getByText('scope.outOfScope.title')).toBeInTheDocument();
    expect(screen.getByText('scope.boundary.title')).toBeInTheDocument();
  });

  it('shows a choose-plan acquisition CTA when the member has no subscriptions', () => {
    render(<MembershipOpsPage subscriptions={[]} documents={[]} />);

    const link = screen.getByRole('link', { name: 'ops.choose_plan' });
    expect(link).toHaveAttribute('href', '/pricing');
    expect(screen.getByText('ops.no_membership_title')).toBeInTheDocument();
    expect(screen.getByText('ops.no_membership_body')).toBeInTheDocument();
  });

  it('routes cancellation through the canonical subscription action', async () => {
    selectionMocks.selectedId = 'sub-1';
    actionMocks.cancelSubscription.mockResolvedValue({
      cancellationTerms: {
        coolingOffAppliesSeparately: true,
        currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
        effectiveFrom: 'next_billing_period',
        hasAcceptedEscalation: false,
        refundStatus: 'eligible',
        refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
      },
      error: undefined,
      success: true,
    });

    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );

    render(
      <MembershipOpsPage
        subscriptions={[
          {
            id: 'sub-1',
            status: 'active',
            planId: 'plan-family',
            createdAt: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: '2027-03-01T00:00:00.000Z',
            plan: { name: 'Family' },
          } as never,
        ]}
        documents={[]}
      />
    );

    fireEvent.click(screen.getByText('Cancel membership'));

    await waitFor(() => {
      expect(actionMocks.cancelSubscription).toHaveBeenCalledWith('sub-1', expect.any(String));
    });
  });

  it('does not leak confirm stubs between tests', () => {
    expect(globalThis.confirm).toBe(originalConfirm);
  });

  it('routes incomplete memberships back into pricing with the current plan', () => {
    selectionMocks.selectedId = 'sub-1';
    actionMocks.getMembershipActions.mockReturnValue({
      primary: {
        id: 'complete_membership',
        label: 'Complete membership',
      },
      secondary: [],
    });

    render(
      <MembershipOpsPage
        subscriptions={[
          {
            id: 'sub-1',
            status: 'canceled',
            planId: 'standard',
            createdAt: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: null,
            plan: { name: 'Standard' },
          } as never,
        ]}
        documents={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete membership' }));

    expect(routerMocks.push).toHaveBeenCalledWith('/pricing?plan=standard');
  });
});
