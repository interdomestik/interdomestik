import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { dispatchNotificationDeliveries } from '@interdomestik/domain-claims/claims/notification-delivery-runner';
import { claimNotificationDeliveryDeps } from './claim-notification-delivery-deps';

export async function kickClaimNotificationDeliveries(
  authority: TenantAuthority,
  deliveryIds: readonly string[]
) {
  if (deliveryIds.length === 0) return;
  try {
    await dispatchNotificationDeliveries(authority, claimNotificationDeliveryDeps, {
      ids: deliveryIds,
    });
  } catch (error) {
    console.error('Notification delivery kick failed after commit', error);
  }
}
