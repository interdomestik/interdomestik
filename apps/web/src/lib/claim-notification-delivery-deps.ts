import { coerceTenantId, resolveTenantAppOrigin } from '@/lib/tenant/tenant-hosts';
import { buildStaffClaimReadScope } from '@interdomestik/domain-claims/staff-claims/scope';
import type { DeliveryDependencies } from '@interdomestik/domain-communications/notification-deliveries';

export const claimNotificationDeliveryDeps: DeliveryDependencies = {
  buildStaffClaimScope: buildStaffClaimReadScope,
  appOrigin(tenantId) {
    const tenant = coerceTenantId(tenantId);
    if (!tenant) throw new Error('Notification tenant origin is unavailable');
    return resolveTenantAppOrigin(tenant);
  },
};
