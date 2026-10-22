import { eq, user, withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import type { ActionResult } from '../types';
import type { ResolveTenantClassificationResult } from './resolve-tenant-classification';

// The caller validates the administrator and current tenant before this database boundary.
export async function confirmCurrentTenantClassification(
  userId: string,
  currentTenantId: string
): Promise<ActionResult<ResolveTenantClassificationResult>> {
  return withTenantContext({ tenantId: currentTenantId }, async tx => {
    const [currentUser] = await tx
      .select({ tenantClassificationPending: user.tenantClassificationPending })
      .from(user)
      .where(withTenant(currentTenantId, user.tenantId, eq(user.id, userId)))
      .for('update');
    if (!currentUser) return { error: 'User not found' };
    const [updated] = await tx
      .update(user)
      .set({ tenantClassificationPending: false })
      .where(withTenant(currentTenantId, user.tenantId, eq(user.id, userId)))
      .returning({ id: user.id });
    if (!updated) throw new Error('Tenant classification update affected no row');
    return {
      success: true,
      data: {
        previousTenantId: currentTenantId,
        tenantId: currentTenantId,
        previousPending: currentUser.tenantClassificationPending === true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    };
  });
}
