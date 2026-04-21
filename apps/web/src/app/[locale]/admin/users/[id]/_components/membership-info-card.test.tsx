import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MembershipInfoCard } from './membership-info-card';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('./utils', () => ({
  formatDate: () => '2025-12-22',
}));

vi.mock('@/features/admin/users/components/tenant-classification-controls', () => ({
  TenantClassificationControls: ({
    userId,
    currentTenantId,
  }: {
    userId: string;
    currentTenantId: string;
  }) => <div>{`tenant-controls:${userId}:${currentTenantId}`}</div>,
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
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: false,
    });

    render(jsx);

    expect(screen.getByText('sections.membership')).toBeInTheDocument();
    expect(screen.getByText('Premium Plan')).toBeInTheDocument();
    expect(screen.getByText('status.active')).toBeInTheDocument();
    expect(screen.getByTestId('membership-lifecycle-status')).toHaveTextContent('status.active');
  });

  it('renders grace-period lifecycle context for admin reporting', async () => {
    const jsx = await MembershipInfoCard({
      subscription: {
        planId: 'Premium Plan',
        currentPeriodEnd: new Date('2026-12-22T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        gracePeriodEndsAt: new Date('2026-04-23T00:00:00.000Z'),
      },
      membershipStatus: 'active_in_grace',
      membershipBadgeClass: 'bg-amber',
      isMembershipProfile: true,
      role: 'member',
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: false,
    });

    render(jsx);

    expect(screen.getByTestId('membership-lifecycle-status')).toHaveTextContent(
      'status.active_in_grace'
    );
    expect(screen.getByTestId('membership-lifecycle-status-detail')).toHaveTextContent(
      'status_context.active_in_grace'
    );
  });

  it('renders scheduled-cancel lifecycle context for admin reporting', async () => {
    const jsx = await MembershipInfoCard({
      subscription: {
        planId: 'Premium Plan',
        currentPeriodEnd: new Date('2026-12-22T00:00:00.000Z'),
        cancelAtPeriodEnd: true,
        gracePeriodEndsAt: null,
      },
      membershipStatus: 'scheduled_cancel',
      membershipBadgeClass: 'bg-blue',
      isMembershipProfile: true,
      role: 'member',
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: false,
    });

    render(jsx);

    expect(screen.getByTestId('membership-lifecycle-status')).toHaveTextContent(
      'status.scheduled_cancel'
    );
    expect(screen.getByTestId('membership-lifecycle-status-detail')).toHaveTextContent(
      'status_context.scheduled_cancel'
    );
  });

  it('renders empty state when no subscription', async () => {
    const jsx = await MembershipInfoCard({
      subscription: null,
      membershipStatus: 'none',
      membershipBadgeClass: 'bg-gray',
      isMembershipProfile: true,
      role: 'member',
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: false,
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
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: false,
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
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: false,
    });

    render(jsx);

    expect(screen.getByText('sections.membership')).toBeInTheDocument();
    expect(screen.getByText('status.registered')).toBeInTheDocument();
    expect(screen.getByText('labels.not_set')).toBeInTheDocument();
  });

  it('renders tenant classification review state when pending', async () => {
    const jsx = await MembershipInfoCard({
      subscription: null,
      membershipStatus: 'registered',
      membershipBadgeClass: 'bg-blue',
      isMembershipProfile: true,
      role: 'member',
      currentTenantId: 'tenant_ks',
      canReassignTenant: false,
      tenantOptions: [],
      userId: 'user-1',
      tenantClassificationPending: true,
    });

    render(jsx);

    expect(screen.getByText('labels.tenant_review')).toBeInTheDocument();
    expect(screen.getByText('labels.tenant_review_pending')).toBeInTheDocument();
    expect(screen.getByText('tenant-controls:user-1:tenant_ks')).toBeInTheDocument();
  });
});
