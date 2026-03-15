import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalConfirm = globalThis.confirm;

const actionMocks = vi.hoisted(() => ({
  activateSponsoredMembership: vi.fn(),
  cancelSubscription: vi.fn(),
  getPaymentUpdateUrl: vi.fn(),
}));

const selectionMocks = vi.hoisted(() => ({
  selectedId: null as string | null,
  setSelectedId: vi.fn(),
}));

vi.mock('@/components/ops', () => ({
  OpsActionBar: ({
    primary,
    secondary,
  }: {
    primary?: { id: string; label: string; onClick: () => void };
    secondary: Array<{ id: string; label: string; onClick: () => void }>;
  }) => (
    <div>
      {primary ? <button onClick={primary.onClick}>{primary.label}</button> : null}
      {secondary.map(action => (
        <button key={action.id} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
  OpsDocumentsPanel: () => null,
  OpsStatusBadge: () => null,
  OpsTable: ({ emptyLabel }: { emptyLabel: string }) => <div>{emptyLabel}</div>,
  OpsTimeline: () => null,
}));

vi.mock('@/components/ops/adapters/membership', () => ({
  getMembershipActions: () => ({
    primary: {
      id: 'update_payment',
      label: 'Update payment',
    },
    secondary: [
      {
        id: 'cancel',
        label: 'Cancel membership',
      },
    ],
  }),
  getSponsoredMembershipState: (subscription?: {
    status?: string | null;
    planId?: string | null;
    provider?: string | null;
    acquisitionSource?: string | null;
  }) => {
    const isSponsored =
      subscription?.provider === 'group_sponsor' ||
      subscription?.acquisitionSource === 'group_roster_import';

    if (!isSponsored) return 'none';
    if (subscription?.status === 'paused') return 'activation_required';
    if (subscription?.status === 'active' && subscription?.planId === 'standard') {
      return 'eligible_for_family_upgrade';
    }
    return 'none';
  },
  toOpsDocuments: () => [],
  toOpsStatus: () => ({ label: 'active', variant: 'default' }),
  toOpsTimelineEvents: () => [],
}));

vi.mock('@/components/ops/useOpsSelectionParam', () => ({
  useOpsSelectionParam: () => ({
    selectedId: selectionMocks.selectedId,
    setSelectedId: selectionMocks.setSelectedId,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => true,
}));

vi.mock('@/actions/subscription.core', () => ({
  activateSponsoredMembership: actionMocks.activateSponsoredMembership,
  cancelSubscription: actionMocks.cancelSubscription,
  getPaymentUpdateUrl: actionMocks.getPaymentUpdateUrl,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@interdomestik/ui', () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { MembershipOpsPage } from './MembershipOpsPage';

describe('MembershipOpsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectionMocks.selectedId = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('activates paused sponsored memberships from the member ops view', async () => {
    selectionMocks.selectedId = 'sub-1';
    actionMocks.activateSponsoredMembership.mockResolvedValue({ success: true });

    render(
      <MembershipOpsPage
        subscriptions={[
          {
            id: 'sub-1',
            status: 'paused',
            planId: 'standard',
            provider: 'group_sponsor',
            acquisitionSource: 'group_roster_import',
            createdAt: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: null,
            plan: { name: 'Standard' },
          } as never,
        ]}
        documents={[]}
      />
    );

    fireEvent.click(screen.getByText('sponsored.activation.cta'));

    await waitFor(() => {
      expect(actionMocks.activateSponsoredMembership).toHaveBeenCalledWith('sub-1');
    });
  });

  it('shows a family self-upgrade CTA for active sponsored standard memberships', () => {
    selectionMocks.selectedId = 'sub-1';

    render(
      <MembershipOpsPage
        subscriptions={[
          {
            id: 'sub-1',
            status: 'active',
            planId: 'standard',
            provider: 'group_sponsor',
            acquisitionSource: 'group_roster_import',
            createdAt: '2026-03-01T00:00:00.000Z',
            currentPeriodEnd: '2027-03-01T00:00:00.000Z',
            plan: { name: 'Standard' },
          } as never,
        ]}
        documents={[]}
      />
    );

    const link = screen.getByRole('link', { name: 'sponsored.upgrade.cta' });
    expect(link).toHaveAttribute('href', '/pricing?plan=family');
  });
});
