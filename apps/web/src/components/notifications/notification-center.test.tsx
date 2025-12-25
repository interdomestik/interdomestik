import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from './notification-center';

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

// Mock UI primitives to avoid portal/open-state complexity.
vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNotifications.mockResolvedValue([]);
  });

  it('shows empty state when there are no notifications', async () => {
    render(<NotificationCenter subscriberId="user-123" />);

    expect(await screen.findByText('All caught up!')).toBeInTheDocument();
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
});
