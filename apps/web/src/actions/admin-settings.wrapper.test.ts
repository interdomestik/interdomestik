import { describe, expect, it, vi } from 'vitest';

import { adminUpdateSettings } from './admin-settings';

vi.mock('./admin-settings/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./admin-settings/update', () => ({
  adminUpdateSettingsCore: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('actions/admin-settings wrapper', () => {
  it('delegates to core and revalidates admin settings path', async () => {
    const { getActionContext } = await import('./admin-settings/context');
    const { adminUpdateSettingsCore } = await import('./admin-settings/update');
    const { revalidatePath } = await import('next/cache');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1', role: 'admin' } },
    });

    (adminUpdateSettingsCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });

    const data = {
      appName: 'Interdomestik',
      supportEmail: 'support@example.com',
      autoAssign: true,
      defaultExpiry: 30,
    };

    const result = await adminUpdateSettings(data);

    expect(adminUpdateSettingsCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1', role: 'admin' } },
      data,
    });

    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(result).toEqual({ success: true });
  });
});
