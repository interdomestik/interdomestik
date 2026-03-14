import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimDetailOpsPage } from './MemberClaimDetailOpsPage';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    if (namespace === 'claims-tracking.status') {
      return (key: string) => {
        if (key === 'evaluation') return 'Evaluation';
        return `claims-tracking.status.${key}`;
      };
    }
    if (namespace === 'claims-tracking.tracking.sla') {
      return (key: string) => {
        const translations: Record<string, string> = {
          title: 'SLA Status',
          running: 'Response timer is running.',
          incomplete: 'Waiting for your information before the SLA starts.',
        };
        return translations[key] || `claims-tracking.tracking.sla.${key}`;
      };
    }
    if (namespace === 'claims') {
      return (key: string) => {
        const translations: Record<string, string> = {
          'detail.matterAllowance.title': 'Matter allowance',
          'detail.matterAllowance.used': 'Used this year',
          'detail.matterAllowance.remaining': 'Remaining this year',
          'detail.matterAllowance.total': 'Plan allowance',
        };

        return translations[key] || `claims.${key}`;
      };
    }
    return (key: string) => (namespace ? `${namespace}.${key}` : key);
  },
}));

describe('MemberClaimDetailOpsPage', () => {
  it('translates claim timeline status keys without using the claims namespace', () => {
    const now = new Date();
    render(
      <MemberClaimDetailOpsPage
        claim={{
          id: 'claim-1',
          title: 'Test Claim',
          status: 'evaluation',
          slaPhase: 'running',
          statusLabelKey: 'claims-tracking.status.evaluation',
          createdAt: now,
          updatedAt: null,
          description: 'desc',
          amount: '0',
          currency: 'EUR',
          canShare: false,
          documents: [],
          timeline: [
            {
              id: 't1',
              date: now,
              statusFrom: 'submitted',
              statusTo: 'evaluation',
              labelKey: 'claims-tracking.status.evaluation',
              note: 'note',
              isPublic: true,
            },
          ],
        }}
      />
    );

    // If the old bug regresses, we'd render "claims.claims-tracking.status.evaluation".
    expect(screen.getByText('Evaluation')).toBeInTheDocument();
  });

  it('shows the member-facing SLA phase when the claim is waiting on member information', () => {
    const now = new Date();
    render(
      <MemberClaimDetailOpsPage
        claim={{
          id: 'claim-2',
          title: 'Verification Claim',
          status: 'verification',
          slaPhase: 'incomplete',
          statusLabelKey: 'claims-tracking.status.verification',
          createdAt: now,
          updatedAt: null,
          description: 'Need more documents',
          amount: '0',
          currency: 'EUR',
          canShare: false,
          documents: [],
          timeline: [],
        }}
      />
    );

    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for your information before the SLA starts.')
    ).toBeInTheDocument();
  });

  it('shows annual matter usage and remaining allowance when the snapshot is available', () => {
    const now = new Date();
    render(
      <MemberClaimDetailOpsPage
        claim={{
          id: 'claim-3',
          title: 'Negotiation Claim',
          status: 'negotiation',
          slaPhase: 'not_applicable',
          statusLabelKey: 'claims-tracking.status.negotiation',
          createdAt: now,
          updatedAt: null,
          description: 'Recovery in progress',
          amount: '550',
          currency: 'EUR',
          canShare: false,
          documents: [],
          timeline: [],
          matterAllowance: {
            allowanceTotal: 2,
            consumedCount: 1,
            remainingCount: 1,
            windowStart: now,
            windowEnd: now,
          },
        }}
      />
    );

    expect(screen.getByText('Matter allowance')).toBeInTheDocument();
    expect(screen.getByText('Used this year')).toBeInTheDocument();
    expect(screen.getByText('Remaining this year')).toBeInTheDocument();
    expect(screen.getByText('Plan allowance')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
