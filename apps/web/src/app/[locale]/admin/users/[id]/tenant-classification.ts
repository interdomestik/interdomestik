import type { AdminTenantOption } from '@/components/admin/admin-tenant-selector';

/**
 * Reassignment targets for the pending tenant-classification controls. Online cross-tenant
 * reassignment is unavailable for the pilot (the server command rejects it for every role), so no
 * target is offered and only "confirm current tenant" is shown.
 */
export function getTenantClassificationOptions(): AdminTenantOption[] {
  return [];
}
