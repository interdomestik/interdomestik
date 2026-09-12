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

const unreadNotification = {
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
      notification={{ ...unreadNotification, actionUrl: '/member/messages' }}
      pending={pending}
      onMarkAsRead={onMarkAsRead}
      onClose={onClose}
      markReadLabel="Mark as read"
      viewLabel="View"
    />
  );
  return { onClose, onMarkAsRead };
}

describe('NotificationCenter acknowledgement truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.menuItemSelectHandlers.length = 0;
    mocks.getNotifications.mockResolvedValue([unreadNotification]);
  });

  it('changes row and derived count only after confirmed success', async () => {
    const acknowledgement = deferred<{ success: true; notificationId: string }>();
    mocks.markAsRead.mockReturnValue(acknowledgement.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    const markButton = within(row).getByRole('button');
    fireEvent.click(markButton);

    expect(markButton).toBeDisabled();
    expect(markButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Processing...');

    await act(async () => acknowledgement.resolve({ success: true, notificationId: 'n1' }));

    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Notification marked as read.');
  });

  it('preserves truth and announces a localized typed failure', async () => {
    mocks.markAsRead.mockResolvedValue({ success: false, error: 'Unauthorized' });
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    fireEvent.click(within(row).getByRole('button'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(within(row).getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('preserves truth and clears pending state when acknowledgement throws', async () => {
    mocks.markAsRead.mockRejectedValue(new Error('network unavailable'));
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    fireEvent.click(within(row).getByRole('button'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(within(row).getByRole('button')).toBeEnabled();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('blocks duplicate single and overlapping mark-all acknowledgements', async () => {
    const acknowledgement = deferred<{ success: true; notificationId: string }>();
    mocks.markAsRead.mockReturnValue(acknowledgement.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const row = await screen.findByTestId('notification-item-new_message');
    const markButton = within(row).getByRole('button');
    fireEvent.click(markButton);
    fireEvent.click(markButton);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(mocks.markAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.markAllAsRead).not.toHaveBeenCalled();

    await act(async () => acknowledgement.resolve({ success: true, notificationId: 'n1' }));
  });

  it('keeps every row unread when mark-all returns a typed failure', async () => {
    mocks.getNotifications.mockResolvedValue([
      unreadNotification,
      { ...unreadNotification, id: 'n2', type: 'claim_assigned', title: 'Claim assigned' },
    ]);
    mocks.markAllAsRead.mockResolvedValue({ success: false, error: 'Unauthorized' });
    render(<NotificationCenter subscriberId="user-123" />);

    await screen.findByText('New message');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByTestId(/notification-item-/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /New message/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Claim assigned/ })).toBeInTheDocument();
  });

  it('keeps bulk acknowledgement pending until success and blocks single overlap', async () => {
    const acknowledgement = deferred<{ success: true }>();
    mocks.getNotifications.mockResolvedValue([
      unreadNotification,
      { ...unreadNotification, id: 'n2', type: 'claim_assigned', title: 'Claim assigned' },
    ]);
    mocks.markAllAsRead.mockReturnValue(acknowledgement.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    const firstRow = await screen.findByTestId('notification-item-new_message');
    const markAllButton = screen.getByRole('button', { name: 'Mark all as read' });
    fireEvent.click(markAllButton);
    fireEvent.click(within(firstRow).getByRole('button'));

    expect(markAllButton).toBeDisabled();
    expect(markAllButton).toHaveAttribute('aria-busy', 'true');
    expect(mocks.markAllAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.markAsRead).not.toHaveBeenCalled();
    expect(screen.getByText('2')).toBeInTheDocument();

    await act(async () => acknowledgement.resolve({ success: true }));

    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All notifications marked as read.');
  });

  it('preserves every row and clears bulk pending state when mark-all throws', async () => {
    mocks.markAllAsRead.mockRejectedValue(new Error('network unavailable'));
    render(<NotificationCenter subscriberId="user-123" />);

    await screen.findByText('New message');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /New message/ })).toBeEnabled();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('keeps the menu open when an unread action acknowledgement fails', async () => {
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
