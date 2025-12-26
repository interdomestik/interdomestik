import { describe, expect, it, vi } from 'vitest';

import { getNotificationPreferences, updateNotificationPreferences } from './user-settings';

vi.mock('./user-settings/context', () => ({
  getActionContext: vi.fn(async () => ({
    session: { user: { id: 'user-1', role: 'user' } },
  })),
}));

vi.mock('./user-settings/get', () => ({
  getNotificationPreferencesCore: vi.fn(async () => ({
    success: true,
    preferences: {
      emailClaimUpdates: true,
      emailMarketing: false,
      emailNewsletter: true,
      pushClaimUpdates: true,
      pushMessages: true,
      inAppAll: true,
    },
  })),
}));

vi.mock('./user-settings/update', () => ({
  updateNotificationPreferencesCore: vi.fn(async () => ({ success: true })),
}));

describe('user-settings action wrapper', () => {
  it('delegates getNotificationPreferences to core', async () => {
    const { getActionContext } = await import('./user-settings/context');
    const { getNotificationPreferencesCore } = await import('./user-settings/get');

    const result = await getNotificationPreferences();

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getNotificationPreferencesCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user' } },
    });
    expect(result).toEqual({
      success: true,
      preferences: {
        emailClaimUpdates: true,
        emailMarketing: false,
        emailNewsletter: true,
        pushClaimUpdates: true,
        pushMessages: true,
        inAppAll: true,
      },
    });
  });

  it('delegates updateNotificationPreferences to core', async () => {
    const { getActionContext } = await import('./user-settings/context');
    const { updateNotificationPreferencesCore } = await import('./user-settings/update');

    const prefs = {
      emailClaimUpdates: false,
      emailMarketing: true,
      emailNewsletter: false,
      pushClaimUpdates: false,
      pushMessages: true,
      inAppAll: false,
    };

    const result = await updateNotificationPreferences(prefs);

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateNotificationPreferencesCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user' } },
      preferences: prefs,
    });
    expect(result).toEqual({ success: true });
  });
});
