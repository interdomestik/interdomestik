import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './notification-bell';

// Mock better-auth
vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    getSession: vi.fn(),
  }),
}));

// Mock NotificationCenter
vi.mock('./notification-center', () => ({
  NotificationCenter: ({ subscriberId }: { subscriberId: string }) => (
    <div data-testid="notification-center">Notifications for {subscriberId}</div>
  ),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null while loading', () => {
    const { container } = render(<NotificationBell />);

    // Initially renders nothing while loading
    expect(container.firstChild).toBeNull();
  });

  it('returns null when user is not authenticated', async () => {
    const { container } = render(<NotificationBell />);

    // Wait for loading to finish
    await waitFor(() => {
      // Should still render nothing if no user
      expect(container.firstChild).toBeNull();
    });
  });
});
