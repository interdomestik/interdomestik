import { describe, expect, it } from 'vitest';

import { normalizeNotificationActionHref } from './notification-action-href';

describe('normalizeNotificationActionHref', () => {
  it('repairs legacy member claim actions only for member claim notifications', () => {
    expect(
      normalizeNotificationActionHref('/sq/dashboard/claims/claim-1?tab=history', 'claim_submitted')
    ).toBe('/member/claims/claim-1?tab=history');
    expect(
      normalizeNotificationActionHref('/dashboard/claims/claim-2', 'claim_status_changed')
    ).toBe('/member/claims/claim-2');
    expect(normalizeNotificationActionHref('/dashboard/claims/claim-3', 'new_message')).toBe(
      '/dashboard/claims/claim-3'
    );
  });
});
