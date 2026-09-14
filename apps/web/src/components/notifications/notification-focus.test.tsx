import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './notification-center';
import { deferred } from './notification-test-ui';

vi.mock('@/i18n/routing', () => ({ Link: 'a', useRouter: () => ({ push: vi.fn() }) }));

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

describe('NotificationCenter acknowledgement focus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNotifications.mockResolvedValue([unread]);
  });

  it.each(['single', 'bulk'] as const)('preserves %s focus through rollback', async kind => {
    const ack = deferred<{ success: false; error: string }>();
    mocks.markAsRead.mockReturnValue(ack.promise);
    mocks.markAllAsRead.mockReturnValue(ack.promise);
    render(<NotificationCenter subscriberId="user-123" />);

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('notification-center-trigger'), { key: 'ArrowDown' });
    });
    await screen.findByText('New message');

    const getControl = () =>
      kind === 'single'
        ? within(screen.getByTestId('notification-item-new_message')).getByRole('menuitem', {
            name: /Mark as read: New message/,
          })
        : screen.getByRole('menuitem', { name: 'Mark all as read' });
    const control = getControl();
    control.focus();
    expect(control).toHaveFocus();

    fireEvent.click(control);
    expect(control).toBeInTheDocument();
    expect(control).toHaveFocus();
    expect(control).not.toBeDisabled();
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveAttribute('aria-busy', 'true');

    await act(async () => ack.resolve({ success: false, error: 'failed' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(getControl()).toHaveFocus();
  });
});
