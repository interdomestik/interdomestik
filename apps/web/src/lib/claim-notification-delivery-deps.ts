import { coerceTenantId, resolveTenantAppOrigin } from '@/lib/tenant/tenant-hosts';
import type { DeliveryDependencies } from '@interdomestik/domain-communications/notification-deliveries';

export const claimNotificationDeliveryDeps: DeliveryDependencies = {
  appOrigin(tenantId) {
    const tenant = coerceTenantId(tenantId);
    if (!tenant) throw new Error('Notification tenant origin is unavailable');
    return resolveTenantAppOrigin(tenant);
  },
};
