import { describe, expect, it, vi } from 'vitest';

import { getNotifications, markAllAsRead, markAsRead } from './notifications';

vi.mock('./notifications/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./notifications/get', () => ({
  getNotificationsCore: vi.fn(),
}));

vi.mock('./notifications/mark-read', () => ({
  markAsReadCore: vi.fn(),
  markAllAsReadCore: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('actions/notifications wrapper', () => {
  it('delegates to core modules and revalidates dashboard', async () => {
    const { getActionContext } = await import('./notifications/context');
    const { getNotificationsCore } = await import('./notifications/get');
    const { markAsReadCore, markAllAsReadCore } = await import('./notifications/mark-read');
    const { revalidatePath } = await import('next/cache');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1' } },
    });

    (getNotificationsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'n1' }]);
    (markAsReadCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (markAllAsReadCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    await getNotifications(10);
    await markAsRead('n1');
    await markAllAsRead();

    expect(getNotificationsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1' } },
      limit: 10,
    });
    expect(markAsReadCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1' } },
      notificationId: 'n1',
    });
    expect(markAllAsReadCore).toHaveBeenCalledWith({ session: { user: { id: 'u1' } } });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('returns safe unauthorized results instead of throwing', async () => {
    const { getActionContext } = await import('./notifications/context');
    const { getNotificationsCore } = await import('./notifications/get');
    const { markAsReadCore, markAllAsReadCore } = await import('./notifications/mark-read');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: null,
      requestHeaders: new Headers(),
    });

    (getNotificationsCore as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Not authenticated')
    );
    (markAsReadCore as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Not authenticated')
    );
    (markAllAsReadCore as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Not authenticated')
    );

    await expect(getNotifications()).resolves.toEqual([]);
    await expect(markAsRead('n1')).resolves.toEqual({ success: false, error: 'Unauthorized' });
    await expect(markAllAsRead()).resolves.toEqual({ success: false, error: 'Unauthorized' });
  });
});
