import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserProfileHeader } from './user-profile-header';

// Mock next-intl/server
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

// Mock utils
vi.mock('./utils', () => ({
  formatDate: () => '2025-12-22',
}));

describe('UserProfileHeader', () => {
  const mockMember = {
    id: 'user-123',
    memberNumber: 'MEM-2026-000123',
    name: 'John Doe',
    email: 'john@example.com',
    emailVerified: new Date() as Date | null,
    role: 'user',
    createdAt: new Date(),
    image: null,
  };

  it('keeps long names, emails and account ids available in shrinking layout items', async () => {
    const name = 'LongName'.repeat(30);
    const email = `${'long-email'.repeat(30)}@example.com`;
    const id = 'account-id'.repeat(30);
    render(
      await UserProfileHeader({
        locale: 'de',
        member: { ...mockMember, name, email, id, memberNumber: null },
        membershipStatus: 'operator',
        membershipBadgeClass: 'bg-sky',
        isMembershipProfile: false,
      })
    );
    expect(screen.getByRole('heading', { name })).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByText(email)).toHaveClass('min-w-0', '[overflow-wrap:anywhere]');
    expect(screen.getByText(id)).toHaveTextContent(id);
  });

  it('renders the canonical member number instead of the raw user id', async () => {
    const jsx = await UserProfileHeader({
      locale: 'en',
      member: mockMember,
      membershipStatus: 'active',
      membershipBadgeClass: 'bg-green',
      isMembershipProfile: true,
    });

    render(jsx);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('MEM-2026-000123')).toBeInTheDocument();
    expect(screen.queryByText('user-123')).not.toBeInTheDocument();
    expect(screen.getByText('labels.member_id:')).toBeInTheDocument();
    expect(screen.getByText('labels.email_verified_yes')).toBeInTheDocument();
  });

  it('renders operator accounts with account id labelling', async () => {
    const jsx = await UserProfileHeader({
      locale: 'en',
      member: {
        ...mockMember,
        id: 'golden_ks_agent_a1',
        memberNumber: null,
        role: 'agent',
      },
      membershipStatus: 'operator',
      membershipBadgeClass: 'bg-sky',
      isMembershipProfile: false,
    });

    render(jsx);

    expect(screen.getByText('labels.account_id:')).toBeInTheDocument();
    expect(screen.getByText('golden_ks_agent_a1')).toBeInTheDocument();
    expect(screen.queryByText('labels.member_id:')).not.toBeInTheDocument();
    expect(screen.getByText('status.operator')).toBeInTheDocument();
  });

  it('renders member-number operators as registered members instead of unsubscribed', async () => {
    const jsx = await UserProfileHeader({
      locale: 'en',
      member: {
        ...mockMember,
        role: 'agent',
      },
      membershipStatus: 'registered',
      membershipBadgeClass: 'bg-blue',
      isMembershipProfile: true,
    });

    render(jsx);

    expect(screen.getByText('labels.member_id:')).toBeInTheDocument();
    expect(screen.getByText('MEM-2026-000123')).toBeInTheDocument();
    expect(screen.getByText('status.registered')).toBeInTheDocument();
    expect(screen.queryByText('status.none')).not.toBeInTheDocument();
  });

  it('renders a pending classification badge when tenant review is still required', async () => {
    const jsx = await UserProfileHeader({
      locale: 'en',
      member: {
        ...mockMember,
        tenantClassificationPending: true,
      },
      membershipStatus: 'registered',
      membershipBadgeClass: 'bg-blue',
      isMembershipProfile: true,
    });

    render(jsx);

    expect(screen.getByText('labels.tenant_review_pending')).toBeInTheDocument();
  });
});
