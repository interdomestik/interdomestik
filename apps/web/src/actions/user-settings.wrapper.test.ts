import { describe, expect, it, vi } from 'vitest';

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  updateResidenceCountry,
} from './user-settings';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

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
  updateResidenceCountryCore: vi.fn(async () => ({
    decision: {
      activeRecoveryClaimCount: 0,
      activeRecoveryRunoff: false,
      changeState: 'pending_terms_reacceptance',
      dsrDecision: 'standard_dsr_with_erasure_render',
      fromResidenceCountry: 'DE',
      migrationDecision: 'defer_to_renewal',
      termsAcceptanceState: 'accepted_snapshot_present',
      termsAction: 'require_reacceptance_before_renewal',
      termsVersionAccepted: 'v1',
      toResidenceCountry: 'AT',
    },
    eventId: 'event-1',
    success: true,
  })),
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
      requestHeaders: expect.any(Headers),
      preferences: prefs,
    });
    expect(result).toEqual({ success: true });
  });

  it('delegates updateResidenceCountry to core', async () => {
    const { getActionContext } = await import('./user-settings/context');
    const { updateResidenceCountryCore } = await import('./user-settings/update');

    const result = await updateResidenceCountry('AT');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateResidenceCountryCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user' } },
      requestHeaders: expect.any(Headers),
      residenceCountry: 'AT',
    });
    expect(result).toMatchObject({ success: true, eventId: 'event-1' });
  });
});
