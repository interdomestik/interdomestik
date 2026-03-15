import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupDashboardSummary } from './group-dashboard-summary';

describe('GroupDashboardSummary', () => {
  it('renders aggregate-only activation, usage, and SLA metrics with an explicit privacy boundary', () => {
    render(
      <GroupDashboardSummary
        summary={{
          activatedMembersCount: 12,
          membersUsingBenefitsCount: 5,
          usageRatePercent: 42,
          openClaimsCount: 6,
          sla: {
            breachCount: 1,
            incompleteCount: 2,
            notApplicableCount: 1,
            runningCount: 3,
          },
        }}
      />
    );

    expect(screen.getByText('Activated members')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Portfolio usage rate')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(
      screen.getByText(
        '5 of 12 activated members have used member services on active sponsored memberships.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Open cases')).toBeInTheDocument();
    expect(screen.getByText('SLA running')).toBeInTheDocument();
    expect(screen.getByText('Waiting on member')).toBeInTheDocument();
    expect(screen.getByText('SLA breaches')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This view stays aggregate-only. No claim facts, notes, or documents are visible here without explicit member consent.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Aggregate only. No member names or claim details are shown in this dashboard.'
      )
    ).toBeInTheDocument();
  });
});
