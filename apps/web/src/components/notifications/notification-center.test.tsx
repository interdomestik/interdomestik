import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './notification-center';
import { deferred } from './notification-test-ui';

vi.mock('@/i18n/routing', () => ({ Link: 'a', useRouter: () => ({ push: vi.fn() }) }));

const mocks = vi.hoisted(() => {
  const getNotifications = vi.fn<() => Promise<unknown[]>>();
  const markAsRead = vi.fn<(notificationId: string) => Promise<unknown>>();
  const markAllAsRead = vi.fn<() => Promise<unknown>>();

  const subscribe = vi.fn<() => { id: string }>(() => ({ id: 'channel' }));
  const on = vi.fn(() => ({ subscribe }));
  const channel = vi.fn<(name: string) => { on: typeof on; subscribe: typeof subscribe }>(() => ({
    on,
    subscribe,
  }));
  const removeChannel = vi.fn();

  return {
    getNotifications,
    markAsRead,
    markAllAsRead,
    channel,
    removeChannel,
  };
});

vi.mock('@/actions/notifications', () => ({
  getNotifications: mocks.getNotifications,
  markAsRead: mocks.markAsRead,
  markAllAsRead: mocks.markAllAsRead,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock('next-intl', async () => {
  const { createNotificationTranslationsMock } = await import('./notification-test-ui');
  return createNotificationTranslationsMock();
});

// Mock UI primitives to avoid portal/open-state complexity.
vi.mock('@interdomestik/ui', async () => {
  const { createNotificationUiMock } = await import('./notification-test-ui');
  return createNotificationUiMock({ withOpenControl: true });
});

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNotifications.mockResolvedValue([]);
  });

  it('shows empty state when there are no notifications', async () => {
    render(<NotificationCenter subscriberId="user-123" />);

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });

  it('shows unread count and renders notification content', async () => {
    mocks.getNotifications.mockResolvedValue([
      {
        id: 'n1',
        userId: 'user-123',
        type: 'new_message',
        title: 'New message',
        content: 'You have a new message',
        actionUrl: null,
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<NotificationCenter subscriberId="user-123" />);

    expect(await screen.findByText('New message')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not fetch notifications on mount when fetchOnMount is disabled', () => {
    render(<NotificationCenter subscriberId="user-123" fetchOnMount={false} />);

    expect(mocks.getNotifications).not.toHaveBeenCalled();
  });

  it('reuses a pending prefetch when the menu opens', async () => {
    const prefetch = deferred<unknown[]>();
    mocks.getNotifications.mockReturnValue(prefetch.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    fireEvent.click(screen.getByText('Open menu'));
    expect(mocks.getNotifications).toHaveBeenCalledTimes(1);
    await act(async () => prefetch.resolve([]));
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });

  it('shows an error instead of an empty inbox and retries a failed fetch', async () => {
    mocks.getNotifications
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce([]);
    render(<NotificationCenter subscriberId="user-123" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('shows a loading state when opened after lazy mount', async () => {
    let resolveNotifications: ((value: unknown[]) => void) | undefined;
    mocks.getNotifications.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveNotifications = resolve;
        })
    );

    render(<NotificationCenter subscriberId="user-123" fetchOnMount={false} />);

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open menu'));

    await waitFor(() => {
      expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
    });

    resolveNotifications?.([]);

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });
});
