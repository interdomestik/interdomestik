import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './notification-bell';

const hoisted = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

// Mock better-auth
vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    getSession: hoisted.mockGetSession,
  }),
}));

// Mock NotificationCenter
vi.mock('./notification-center', () => ({
  NotificationCenter: ({
    subscriberId,
    fetchOnMount,
  }: {
    subscriberId: string;
    fetchOnMount?: boolean;
  }) => (
    <div data-testid="notification-center">
      Notifications for {subscriberId} ({fetchOnMount === false ? 'lazy' : 'eager'})
    </div>
  ),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders from a provided subscriber id without fetching session', async () => {
    const { getByTestId } = render(<NotificationBell subscriberId="staff-1" />);

    await waitFor(() => {
      expect(getByTestId('notification-center')).toHaveTextContent(
        'Notifications for staff-1 (eager)'
      );
    });

    expect(hoisted.mockGetSession).not.toHaveBeenCalled();
  });

  it('can opt into lazy notification fetching when the shell already has route context', async () => {
    const { getByTestId } = render(
      <NotificationBell subscriberId="staff-1" prefetchNotifications={false} />
    );

    await waitFor(() => {
      expect(getByTestId('notification-center')).toHaveTextContent(
        'Notifications for staff-1 (lazy)'
      );
    });
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
