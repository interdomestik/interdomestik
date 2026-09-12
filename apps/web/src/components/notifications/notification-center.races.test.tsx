import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './notification-center';
import { deferred } from './notification-test-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  getNotifications: vi.fn<() => Promise<unknown[]>>(),
  markAsRead: vi.fn<(notificationId: string) => Promise<unknown>>(),
  markAllAsRead: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@/actions/notifications', () => mocks);

vi.mock('next-intl', async () => {
  const { createNotificationTranslationsMock } = await import('./notification-test-ui');
  return createNotificationTranslationsMock();
});

vi.mock('@interdomestik/ui', async () => {
  const { createNotificationUiMock } = await import('./notification-test-ui');
  return createNotificationUiMock({ withOpenControl: true });
});

function notification(userId: string, title: string) {
  return {
    id: 'shared-id',
    userId,
    type: 'new_message',
    title,
    content: `${title} content`,
    actionUrl: null,
    isRead: false,
    createdAt: '2026-09-12T00:00:00.000Z',
  };
}

describe('NotificationCenter race boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose a stale subscriber fetch after subscriber change', async () => {
    const firstFetch = deferred<unknown[]>();
    const secondFetch = deferred<unknown[]>();
    mocks.getNotifications
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);
    const view = render(<NotificationCenter subscriberId="user-123" />);

    view.rerender(<NotificationCenter subscriberId="user-456" />);
    await act(async () => secondFetch.resolve([notification('user-456', 'Current subscriber')]));
    expect(await screen.findByText('Current subscriber')).toBeInTheDocument();

    await act(async () => firstFetch.resolve([notification('user-123', 'Previous subscriber')]));
    expect(screen.getByText('Current subscriber')).toBeInTheDocument();
    expect(screen.queryByText('Previous subscriber')).not.toBeInTheDocument();
  });

  it('ignores an old subscriber acknowledgement after subscriber change', async () => {
    const acknowledgement = deferred<{ success: true; notificationId: string }>();
    mocks.markAsRead.mockReturnValue(acknowledgement.promise);
    mocks.getNotifications
      .mockResolvedValueOnce([notification('user-123', 'Previous subscriber')])
      .mockResolvedValueOnce([notification('user-456', 'Current subscriber')]);
    const view = render(<NotificationCenter subscriberId="user-123" />);

    const oldRow = await screen.findByTestId('notification-item-new_message');
    fireEvent.click(within(oldRow).getByRole('button'));
    view.rerender(<NotificationCenter subscriberId="user-456" />);
    const currentRow = await screen.findByTestId('notification-item-new_message');
    expect(within(currentRow).getByText('Current subscriber')).toBeInTheDocument();

    await act(async () => acknowledgement.resolve({ success: true, notificationId: 'shared-id' }));
    expect(within(currentRow).getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not let a stale refetch overwrite a confirmed acknowledgement', async () => {
    const refetch = deferred<unknown[]>();
    const acknowledgement = deferred<{ success: true; notificationId: string }>();
    mocks.getNotifications
      .mockResolvedValueOnce([notification('user-123', 'New message')])
      .mockReturnValueOnce(refetch.promise);
    mocks.markAsRead.mockReturnValue(acknowledgement.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    fireEvent.click(within(row).getByRole('button'));
    fireEvent.click(screen.getByText('Open menu'));
    await act(async () => acknowledgement.resolve({ success: true, notificationId: 'shared-id' }));
    await act(async () => refetch.resolve([notification('user-123', 'New message')]));

    const currentRow = await screen.findByTestId('notification-item-new_message');
    expect(within(currentRow).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('clears an earlier failure when a concurrent acknowledgement later succeeds', async () => {
    const failed = deferred<{ success: false; error: string }>();
    const succeeded = deferred<{ success: true; notificationId: string }>();
    mocks.markAsRead.mockReturnValueOnce(failed.promise).mockReturnValueOnce(succeeded.promise);
    mocks.getNotifications.mockResolvedValue([
      notification('user-123', 'First message'),
      {
        ...notification('user-123', 'Second message'),
        id: 'second-id',
        type: 'claim_assigned',
      },
    ]);
    render(<NotificationCenter subscriberId="user-123" />);

    const rows = await screen.findAllByTestId(/notification-item-/);
    fireEvent.click(within(rows[0]).getByRole('button'));
    fireEvent.click(within(rows[1]).getByRole('button'));

    await act(async () => failed.resolve({ success: false, error: 'first request failed' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await act(async () => succeeded.resolve({ success: true, notificationId: 'second-id' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Notification marked as read.');
  });

  it('keeps a new single pending across an A-to-B-to-A subscriber cycle', async () => {
    const oldAcknowledgement = deferred<{ success: true; notificationId: string }>();
    const currentAcknowledgement = deferred<{ success: false; error: string }>();
    mocks.markAsRead
      .mockReturnValueOnce(oldAcknowledgement.promise)
      .mockReturnValueOnce(currentAcknowledgement.promise);
    mocks.getNotifications
      .mockResolvedValueOnce([notification('user-123', 'Old A')])
      .mockResolvedValueOnce([notification('user-456', 'Subscriber B')])
      .mockResolvedValueOnce([notification('user-123', 'Current A')]);
    const view = render(<NotificationCenter subscriberId="user-123" />);

    const oldRow = await screen.findByText('Old A');
    fireEvent.click(within(oldRow.closest('[data-testid]') as HTMLElement).getByRole('button'));
    view.rerender(<NotificationCenter subscriberId="user-456" />);
    await screen.findByText('Subscriber B');
    view.rerender(<NotificationCenter subscriberId="user-123" />);

    const currentTitle = await screen.findByText('Current A');
    const currentRow = currentTitle.closest('[data-testid]') as HTMLElement;
    const currentButton = within(currentRow).getByRole('button');
    fireEvent.click(currentButton);
    expect(mocks.markAsRead).toHaveBeenCalledTimes(2);

    await act(async () =>
      oldAcknowledgement.resolve({ success: true, notificationId: 'shared-id' })
    );
    expect(currentButton).toBeDisabled();
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(currentButton);
    expect(mocks.markAsRead).toHaveBeenCalledTimes(2);

    await act(async () =>
      currentAcknowledgement.resolve({ success: false, error: 'current request failed' })
    );
    expect(within(currentRow).getByRole('button')).toBeEnabled();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('keeps a new bulk request pending across an A-to-B-to-A subscriber cycle', async () => {
    const oldAcknowledgement = deferred<{ success: true; notificationIds: string[] }>();
    const currentAcknowledgement = deferred<{ success: false; error: string }>();
    mocks.markAllAsRead
      .mockReturnValueOnce(oldAcknowledgement.promise)
      .mockReturnValueOnce(currentAcknowledgement.promise);
    mocks.getNotifications
      .mockResolvedValueOnce([notification('user-123', 'Old A')])
      .mockResolvedValueOnce([notification('user-456', 'Subscriber B')])
      .mockResolvedValueOnce([notification('user-123', 'Current A')]);
    const view = render(<NotificationCenter subscriberId="user-123" />);

    await screen.findByText('Old A');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    view.rerender(<NotificationCenter subscriberId="user-456" />);
    await screen.findByText('Subscriber B');
    view.rerender(<NotificationCenter subscriberId="user-123" />);
    await screen.findByText('Current A');

    const currentButton = screen.getByRole('button', { name: 'Mark all as read' });
    fireEvent.click(currentButton);
    expect(mocks.markAllAsRead).toHaveBeenCalledTimes(2);

    await act(async () =>
      oldAcknowledgement.resolve({ success: true, notificationIds: ['shared-id'] })
    );
    expect(currentButton).toBeDisabled();
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(currentButton);
    expect(mocks.markAllAsRead).toHaveBeenCalledTimes(2);

    await act(async () =>
      currentAcknowledgement.resolve({ success: false, error: 'current request failed' })
    );
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeEnabled();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('loads the replacement subscriber when a lazy menu remains open', async () => {
    mocks.getNotifications
      .mockResolvedValueOnce([notification('user-123', 'Subscriber A')])
      .mockResolvedValueOnce([notification('user-456', 'Subscriber B')]);
    const view = render(<NotificationCenter subscriberId="user-123" fetchOnMount={false} />);

    fireEvent.click(screen.getByText('Open menu'));
    await screen.findByText('Subscriber A');
    view.rerender(<NotificationCenter subscriberId="user-456" fetchOnMount={false} />);

    expect(await screen.findByText('Subscriber B')).toBeInTheDocument();
    expect(screen.queryByText('Subscriber A')).not.toBeInTheDocument();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('does not reuse an old snapshot after a closed lazy A-to-B-to-A cycle', async () => {
    mocks.getNotifications.mockResolvedValueOnce([notification('user-123', 'Old subscriber A')]);
    const view = render(<NotificationCenter subscriberId="user-123" />);

    await screen.findByText('Old subscriber A');
    view.rerender(<NotificationCenter subscriberId="user-456" fetchOnMount={false} />);
    view.rerender(<NotificationCenter subscriberId="user-123" fetchOnMount={false} />);

    expect(screen.queryByText('Old subscriber A')).not.toBeInTheDocument();
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(1);
  });
});
