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
    // Default: echo for stability.
    return (key: string) => (namespace ? `${namespace}.${key}` : key);
  },
}));

describe('MemberClaimDetailOpsPage', () => {
  it('translates claim timeline status keys without using the claims namespace', () => {
    render(
      <MemberClaimDetailOpsPage
        // Minimal DTO surface used by the component.
        claim={{
          id: 'claim-1',
          title: 'Test Claim',
          description: 'desc',
          amount: 0,
          currency: 'EUR',
          status: 'evaluation',
          createdAt: new Date().toISOString() as any,
          updatedAt: null as any,
          documents: [],
          timeline: [
            {
              id: 't1',
              date: new Date().toISOString() as any,
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
});
