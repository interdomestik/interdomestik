import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './notification-center';
import { deferred } from './notification-test-ui';

vi.mock('@/i18n/routing', () => ({ Link: 'a', useRouter: () => ({ push: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  getNotifications: vi.fn<() => Promise<unknown[]>>(),
  markAsRead: vi.fn<(notificationId: string) => Promise<unknown>>(),
  markAllAsRead: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@/actions/notifications', () => ({
  getNotifications: mocks.getNotifications,
  markAsRead: mocks.markAsRead,
  markAllAsRead: mocks.markAllAsRead,
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
    vi.resetAllMocks();
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

  it.each([
    ['network unavailable', false],
    ['Not authenticated', false],
    ['Not authenticated', true],
  ])('shows a retryable error for %s (after mount: %s)', async (error, afterMount) => {
    if (afterMount) mocks.getNotifications.mockResolvedValueOnce([]);
    mocks.getNotifications.mockRejectedValueOnce(new Error(error)).mockResolvedValueOnce([]);
    render(<NotificationCenter subscriberId="user-123" />);
    if (afterMount) {
      await screen.findByText('No notifications yet');
      fireEvent.click(screen.getByText('Open menu'));
    }

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(afterMount ? 3 : 2);
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

  it.each([
    ['single', false],
    ['single', true],
    ['bulk', false],
    ['bulk', true],
  ])('reconciles %s acknowledgement (fetch finishes first: %s)', async (kind, fetchFirst) => {
    const initial = {
      id: 'n1',
      userId: 'user-123',
      type: 'new_message',
      title: 'Initial message',
      content: 'Message content',
      isRead: false,
      actionUrl: null,
      createdAt: '2026-09-13T00:00:00.000Z',
    };
    const arrival = { ...initial, id: 'n2', type: 'claim_assigned', title: 'New arrival' };
    const arrivalRead = kind === 'bulk' && fetchFirst;
    const refetch = deferred<unknown[]>();
    const acknowledgement = deferred<{ success: true; notificationId: string }>();
    mocks.getNotifications
      .mockResolvedValueOnce([initial])
      .mockReturnValueOnce(refetch.promise)
      .mockResolvedValueOnce([
        { ...initial, isRead: true },
        { ...arrival, isRead: arrivalRead },
      ]);
    mocks.markAsRead.mockReturnValue(acknowledgement.promise);
    mocks.markAllAsRead.mockReturnValue(acknowledgement.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    fireEvent.click(
      kind === 'single' ? within(row).getByRole('button') : screen.getByText('Mark all as read')
    );
    fireEvent.click(screen.getByText('Open menu'));
    if (fetchFirst) await act(async () => refetch.resolve([initial, arrival]));
    await act(async () => acknowledgement.resolve({ success: true, notificationId: 'n1' }));
    if (!fetchFirst) await act(async () => refetch.resolve([initial]));

    expect(await screen.findByText('New arrival')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('notification-item-new_message')).queryByRole('button')
    ).not.toBeInTheDocument();
    const arrivalButton = within(
      screen.getByTestId('notification-item-claim_assigned')
    ).queryByRole('button');
    if (arrivalRead) {
      expect(arrivalButton).not.toBeInTheDocument();
      expect(screen.queryByText('1')).not.toBeInTheDocument();
    } else {
      expect(arrivalButton).toBeEnabled();
      expect(screen.getByText('1')).toBeInTheDocument();
    }
    expect(mocks.getNotifications).toHaveBeenCalledTimes(kind === 'single' && fetchFirst ? 2 : 3);
  });
});
