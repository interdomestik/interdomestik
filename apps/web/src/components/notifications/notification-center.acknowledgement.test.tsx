import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './notification-center';
import { NotificationItem, normalizeNotificationActionHref } from './notification-item';
import { deferred } from './notification-test-ui';

vi.mock('@/i18n/routing', () => ({ Link: 'a', useRouter: () => ({ push: mocks.routerPush }) }));

const mocks = vi.hoisted(() => ({
  getNotifications: vi.fn<() => Promise<unknown[]>>(),
  markAsRead: vi.fn<(notificationId: string) => Promise<unknown>>(),
  markAllAsRead: vi.fn<() => Promise<unknown>>(),
  routerPush: vi.fn(),
  menuItemSelectHandlers: [] as Array<((event: { preventDefault(): void }) => void) | undefined>,
}));

vi.mock('@/actions/notifications', () => mocks);

vi.mock('next-intl', async () => {
  const { createNotificationTranslationsMock } = await import('./notification-test-ui');
  return createNotificationTranslationsMock();
});

vi.mock('@interdomestik/ui', async () => {
  const { createNotificationUiMock } = await import('./notification-test-ui');
  return {
    ...createNotificationUiMock({ withOpenControl: true }),
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: (event: { preventDefault(): void }) => void;
    }) => {
      mocks.menuItemSelectHandlers.push(onSelect);
      return <>{children}</>;
    },
  };
});

const unread = {
  id: 'n1',
  userId: 'user-123',
  type: 'new_message',
  title: 'New message',
  content: 'You have a new message',
  actionUrl: null,
  isRead: false,
  createdAt: '2026-09-12T00:00:00.000Z',
};

function renderUnreadAction(pending: boolean, onMarkAsRead = vi.fn(async () => true)) {
  const onClose = vi.fn();
  render(
    <NotificationItem
      notification={{ ...unread, actionUrl: '/member/messages' }}
      pending={pending}
      blocked={pending}
      onMarkAsRead={onMarkAsRead}
      onClose={onClose}
      markReadLabel="Mark as read"
      viewLabel="View"
    />
  );
  return { onClose, onMarkAsRead };
}

const bulkButton = () => screen.getByRole('button', { name: 'Mark all as read' });

describe('NotificationCenter ack truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.menuItemSelectHandlers.length = 0;
    mocks.getNotifications.mockResolvedValue([unread]);
  });

  it('optimistically reads the row and count until confirmation', async () => {
    const ack = deferred<{ success: true; notificationId: string }>();
    mocks.markAsRead.mockReturnValue(ack.promise);
    mocks.getNotifications.mockResolvedValue([{ ...unread, actionUrl: '/member/messages' }]);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    fireEvent.click(within(row).getByRole('link'));
    expect(mocks.routerPush).not.toHaveBeenCalled();

    expect(within(row).getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Processing...');

    await act(async () => ack.resolve({ success: true, notificationId: 'n1' }));
    expect(mocks.routerPush).toHaveBeenCalledExactlyOnceWith('/member/messages');

    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Notification marked as read.');
  });

  it.each(['typed', 'thrown', 'wrong ID'])('rolls back optimism on %s failure', async kind => {
    const ack = deferred<unknown>();
    mocks.markAsRead.mockReturnValue(ack.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    const control = within(row).getByRole('button');
    control.focus();
    fireEvent.click(control);
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    await act(async () => {
      if (kind === 'thrown') ack.reject(new Error('offline'));
      else ack.resolve({ success: kind === 'wrong ID', notificationId: 'other-id' });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(within(row).getByRole('button')).toBeEnabled();
    expect(within(row).getByRole('button')).toHaveFocus();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('Notification marked as read.');
  });

  it('blocks duplicate single and overlapping mark-all acknowledgements', async () => {
    const ack = deferred<{ success: true; notificationId: string }>();
    mocks.markAsRead.mockReturnValue(ack.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    const markButton = within(row).getByRole('button');
    const markAll = bulkButton();
    act(() => {
      fireEvent.click(markButton);
      fireEvent.click(markButton);
      fireEvent.click(markAll);
    });

    expect(mocks.markAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.markAllAsRead).not.toHaveBeenCalled();

    await act(async () => ack.resolve({ success: true, notificationId: 'n1' }));
  });

  it.each(['typed', 'thrown'])('rolls every row back on bulk %s failure', async kind => {
    mocks.getNotifications.mockResolvedValue([
      unread,
      { ...unread, id: 'n2', type: 'claim_assigned', title: 'Claim assigned' },
      { ...unread, id: 'n3', type: 'sla_warning', title: 'Already read', isRead: true },
    ]);
    const ack = deferred<unknown>();
    mocks.markAllAsRead.mockReturnValue(ack.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    await screen.findByText('New message');
    const markAll = bulkButton();
    markAll.focus();
    fireEvent.click(markAll);
    expect(markAll).toHaveFocus();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New message/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: /Claim assigned/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.queryByRole('button', { name: /Already read/ })).not.toBeInTheDocument();
    await act(async () => {
      if (kind === 'thrown') ack.reject(new Error('offline'));
      else ack.resolve({ success: false, error: 'Unauthorized' });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(bulkButton()).toBeEnabled();
    expect(bulkButton()).toHaveFocus();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByTestId(/notification-item-/)).toHaveLength(3);
    expect(screen.getByRole('button', { name: /New message/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Claim assigned/ })).toBeEnabled();
  });

  it('keeps bulk ack pending until success and blocks single overlap', async () => {
    const ack = deferred<{ success: true }>();
    mocks.getNotifications.mockResolvedValue([
      unread,
      { ...unread, id: 'n2', type: 'claim_assigned', title: 'Claim assigned' },
    ]);
    mocks.markAllAsRead.mockReturnValue(ack.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const firstRow = await screen.findByTestId('notification-item-new_message');
    const markAllButton = bulkButton();
    const single = within(firstRow).getByRole('button');
    act(() => {
      fireEvent.click(markAllButton);
      fireEvent.click(single);
    });

    expect(screen.getByRole('button', { name: 'Mark all as read' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(firstRow).toHaveAttribute('aria-busy', 'true');
    expect(mocks.markAllAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.markAsRead).not.toHaveBeenCalled();
    expect(screen.queryByText('2')).not.toBeInTheDocument();

    mocks.getNotifications.mockResolvedValue([
      { ...unread, isRead: true },
      { ...unread, id: 'n2', isRead: true },
    ]);
    await act(async () => ack.resolve({ success: true }));

    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All notifications marked as read.');
  });

  it('keeps bulk success truthful when reconciliation fails and retries only on request', async () => {
    mocks.getNotifications
      .mockResolvedValueOnce([unread])
      .mockRejectedValueOnce(new Error('refresh unavailable'))
      .mockResolvedValueOnce([{ ...unread, isRead: true }]);
    mocks.markAllAsRead.mockResolvedValue({ success: true });
    render(<NotificationCenter subscriberId="user-123" />);
    await screen.findByText('New message');
    fireEvent.click(screen.getByText('Mark all as read'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All notifications marked as read.');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    const row = await screen.findByTestId('notification-item-new_message');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(3);
    expect(mocks.markAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu open when an unread action ack fails', async () => {
    vi.useFakeTimers();
    const onMarkAsRead = vi.fn(async () => false);
    const { onClose } = renderUnreadAction(false, onMarkAsRead);

    fireEvent.click(screen.getByRole('link', { name: /View/ }));
    await act(async () => {
      await Promise.resolve();
      vi.runAllTimers();
    });

    expect(onMarkAsRead).toHaveBeenCalledWith('n1', expect.anything());
    const preventDefault = vi.fn();
    mocks.menuItemSelectHandlers.at(-1)?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('normalizes stored localized actions before locale-aware navigation', () => {
    expect(normalizeNotificationActionHref('/sq/member/messages?claim=1')).toBe(
      '/member/messages?claim=1'
    );
  });

  it('waits for ack before closing and navigating an unread action', async () => {
    const ack = deferred<boolean>();
    const onMarkAsRead = vi.fn(() => ack.promise);
    const { onClose } = renderUnreadAction(false, onMarkAsRead);

    fireEvent.click(screen.getByRole('link', { name: /View/ }));
    expect(onMarkAsRead).toHaveBeenCalledWith('n1', expect.anything());
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalled();

    await act(async () => ack.resolve(true));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.routerPush).toHaveBeenCalledExactlyOnceWith('/member/messages');
  });

  it('makes a pending action non-focusable and ignores activation', () => {
    const { onMarkAsRead } = renderUnreadAction(true);
    const action = screen.getByRole('link', { name: /View/ });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(action).toHaveAttribute('tabindex', '-1');
    fireEvent.click(action);
    expect(onMarkAsRead).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });
});
