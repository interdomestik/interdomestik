import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { getNotifications, markAllAsRead, markAsRead } from './notifications';

vi.mock('./notifications/context', () => ({
  getActionContext: vi.fn(),
  getAuthorizedActionContext: vi.fn(),
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
    const { getActionContext, getAuthorizedActionContext } =
      await import('./notifications/context');
    const { getNotificationsCore } = await import('./notifications/get');
    const { markAsReadCore, markAllAsReadCore } = await import('./notifications/mark-read');
    const { revalidatePath } = await import('next/cache');
    const authority = mintTestTenantAuthority('tenant-1');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1' } },
    });
    (getAuthorizedActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1' } },
      authority,
    });

    (getNotificationsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'n1' }]);
    (markAsReadCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (markAllAsReadCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    await getNotifications(10);
    await markAsRead('n1');
    await markAllAsRead();

    expect(getNotificationsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1' } },
      authority,
      limit: 10,
      locale: 'sq',
    });
    expect(markAsReadCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1' } },
      notificationId: 'n1',
    });
    expect(markAllAsReadCore).toHaveBeenCalledWith({ session: { user: { id: 'u1' } } });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('reports fetch and mutation failures', async () => {
    const { getActionContext, getAuthorizedActionContext } =
      await import('./notifications/context');
    const { getNotificationsCore } = await import('./notifications/get');
    const { markAsReadCore, markAllAsReadCore } = await import('./notifications/mark-read');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: null,
      requestHeaders: new Headers(),
    });
    (getAuthorizedActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: null,
      authority: null,
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

    await expect(getNotifications()).rejects.toThrow('Not authenticated');
    await expect(markAsRead('n1')).resolves.toEqual({ success: false, error: 'Unauthorized' });
    await expect(markAllAsRead()).resolves.toEqual({ success: false, error: 'Unauthorized' });
  });

  it.each([
    ['en', '/sq/member', 'en'],
    ['mk', null, 'mk'],
    [undefined, '/en/member/notifications', 'en'],
    ['hr', '/mk/member', 'mk'],
  ])(
    'renders notification copy for explicit %s / page %s in %s, not the default (qa3 #67)',
    async (explicit, page, expected) => {
      const { getAuthorizedActionContext } = await import('./notifications/context');
      const { getNotificationsCore } = await import('./notifications/get');
      (getNotificationsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getAuthorizedActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        session: { user: { id: 'u1' } },
        authority: null,
        requestHeaders: new Headers(page ? { referer: `https://ida.example${page}` } : {}),
      });
      await getNotifications(20, explicit);
      expect(getNotificationsCore).toHaveBeenLastCalledWith(
        expect.objectContaining({ locale: expected })
      );
    }
  );
});
