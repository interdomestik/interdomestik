import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MembershipInfoCard } from './membership-info-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('./utils', () => ({
  formatDate: () => '2025-12-22',
}));

describe('MembershipInfoCard', () => {
  it('renders subscription details', async () => {
    const mockSubscription = {
      planId: 'Premium Plan',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    };

    const jsx = await MembershipInfoCard({
      subscription: mockSubscription,
      membershipStatus: 'active',
      membershipBadgeClass: 'bg-green',
      isMembershipProfile: true,
      role: 'member',
    });

    render(jsx);

    expect(screen.getByText('sections.membership')).toBeInTheDocument();
    expect(screen.getByText('Premium Plan')).toBeInTheDocument();
    expect(screen.getByText('status.active')).toBeInTheDocument();
  });

  it('renders empty state when no subscription', async () => {
    const jsx = await MembershipInfoCard({
      subscription: null,
      membershipStatus: 'none',
      membershipBadgeClass: 'bg-gray',
      isMembershipProfile: true,
      role: 'member',
    });

    render(jsx);

    expect(screen.getByText('labels.not_set')).toBeInTheDocument();
  });

  it('renders operator account state instead of member subscription state', async () => {
    const jsx = await MembershipInfoCard({
      subscription: null,
      membershipStatus: 'operator',
      membershipBadgeClass: 'bg-sky',
      isMembershipProfile: false,
      role: 'agent',
    });

    render(jsx);

    expect(screen.getByText('sections.account')).toBeInTheDocument();
    expect(screen.getByText('status.operator')).toBeInTheDocument();
    expect(screen.getAllByText('labels.not_applicable')).toHaveLength(2);
  });

  it('renders registered member state when member identity exists without billing subscription', async () => {
    const jsx = await MembershipInfoCard({
      subscription: null,
      membershipStatus: 'registered',
      membershipBadgeClass: 'bg-blue',
      isMembershipProfile: true,
      role: 'agent',
    });

    render(jsx);

    expect(screen.getByText('sections.membership')).toBeInTheDocument();
    expect(screen.getByText('status.registered')).toBeInTheDocument();
    expect(screen.getByText('labels.not_set')).toBeInTheDocument();
  });
});
