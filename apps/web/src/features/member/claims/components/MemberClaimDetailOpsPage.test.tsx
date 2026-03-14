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
    // Default: echo for stability.
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
});
