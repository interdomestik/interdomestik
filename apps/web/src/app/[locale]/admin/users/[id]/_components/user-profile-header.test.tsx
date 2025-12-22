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
    name: 'John Doe',
    email: 'john@example.com',
    emailVerified: true,
    role: 'user',
    createdAt: new Date(),
    image: null,
  };

  it('renders member details', async () => {
    const jsx = await UserProfileHeader({
      member: mockMember,
      membershipStatus: 'active',
      membershipBadgeClass: 'bg-green',
    });

    render(jsx);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('labels.member_id:')).toBeInTheDocument();
    expect(screen.getByText('labels.email_verified_yes')).toBeInTheDocument();
  });
});
