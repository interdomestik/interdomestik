import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { updateNotificationPreferences } from '@/actions/user-settings';
import { syncPushSubscription } from '@/lib/pwa/push-subscription';
import { NotificationSettings } from './notification-settings';

vi.mock('@/actions/user-settings', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));
vi.mock('@/lib/pwa/push-subscription', () => ({ syncPushSubscription: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('notification push cleanup feedback', () => {
  afterEach(() => vi.clearAllMocks());
  it('shows the existing save error instead of success after incomplete push cleanup', async () => {
    vi.mocked(updateNotificationPreferences).mockResolvedValue({ success: true });
    vi.mocked(syncPushSubscription).mockResolvedValue({ ok: false, reason: 'push-sync-failed' });
    render(
      <NotificationSettings initialPreferences={{ pushClaimUpdates: false, pushMessages: false }} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'notifications.save' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('notifications.saveError'));
    expect(syncPushSubscription).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
