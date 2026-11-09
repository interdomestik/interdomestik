import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MembershipCard } from './membership-card';

describe('agent membership card', () => {
  it.each(['sponsor', 'subscription', 'none'] as const)(
    'renders source, status and period for %s',
    source => {
      const covered = source !== 'none';
      render(
        <MembershipCard
          locale="sq"
          membership={{
            source,
            status: covered ? 'active' : 'none',
            badgeClass: '',
            subscription: null,
            planId: covered ? 'effective-plan' : null,
            currentPeriodStart: covered ? new Date('2026-01-01') : null,
            currentPeriodEnd: covered ? new Date('2027-01-01') : null,
            cancelAtPeriodEnd: false,
          }}
          t={key => key}
          tCommon={key => key}
        />
      );
      expect(screen.getByText(`source.${source}`)).toBeInTheDocument();
      expect(screen.getByText(covered ? 'status.active' : 'status.none')).toBeInTheDocument();
      if (covered) {
        expect(screen.getByText('effective-plan')).toBeInTheDocument();
        expect(screen.getByText('01.01.2026')).toBeInTheDocument();
        expect(screen.getByText('01.01.2027')).toBeInTheDocument();
      } else {
        expect(screen.getByText('labels.not_set')).toBeInTheDocument();
      }
    }
  );
});
