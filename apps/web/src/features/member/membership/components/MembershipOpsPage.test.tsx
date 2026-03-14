import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
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
  cancelSubscription: actionMocks.cancelSubscription,
  getPaymentUpdateUrl: actionMocks.getPaymentUpdateUrl,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

  it('shows scope and referral boundaries alongside membership operations', () => {
    render(<MembershipOpsPage subscriptions={[]} documents={[]} />);

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
});
