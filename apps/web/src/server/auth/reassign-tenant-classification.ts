import { validateResolutionInput } from '@interdomestik/domain-users/admin/resolve-tenant-classification';
import { and, dbAdmin, eq, tenants, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { ActionResult, UserSession } from '@interdomestik/domain-users/types';
import { hasTenantBoundRecords } from './tenant-classification-bound-records';
import type { ResolveTenantClassificationResult } from '@interdomestik/domain-users/admin/resolve-tenant-classification';

export type ReassignmentTransaction = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

// Cross-tenant transition is restricted to the validated technical super-admin session.
// This fixed operation exposes neither a privileged client nor a generic callback.
export async function reassignTenantClassification(params: {
  session: UserSession | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<ResolveTenantClassificationResult>> {
  if (params.session?.user?.role !== 'super_admin') return { error: 'Unauthorized' };
  const validation = await validateResolutionInput(params);
  if ('error' in validation) return validation;
  if (!validation.data || validation.data.resolutionMode !== 'reassign')
    return { error: 'Reassignment requires a different target tenant' };
  const { currentTenantId, nextTenantId } = validation.data;
  const { userId } = params;
  try {
    return await dbAdmin.transaction(async tx => {
      const [currentUser] = await tx
        .select({
          id: user.id,
          tenantClassificationPending: user.tenantClassificationPending,
        })
        .from(user)
        .where(withTenant(currentTenantId, user.tenantId, eq(user.id, userId)))
        .for('update');
      if (!currentUser) return { error: 'User not found' };
      const targetTenant = await tx.query.tenants.findFirst({
        where: and(eq(tenants.id, nextTenantId), eq(tenants.isActive, true)),
        columns: { id: true },
      });
      if (!targetTenant) return { error: 'Target tenant not found' };
      if (await hasTenantBoundRecords(tx, { userId, tenantId: currentTenantId })) {
        return { error: 'Cannot reassign tenant classification while tenant-bound records exist' };
      }
      const [updated] = await tx
        .update(user)
        .set({
          tenantId: nextTenantId,
          tenantClassificationPending: false,
        })
        .where(withTenant(currentTenantId, user.tenantId, eq(user.id, userId)))
        .returning({ id: user.id });
      if (!updated) return { error: 'User not found' };
      return {
        success: true,
        data: {
          previousTenantId: currentTenantId,
          tenantId: nextTenantId,
          previousPending: currentUser.tenantClassificationPending === true,
          tenantClassificationPending: false,
          resolutionMode: 'reassign',
        },
      };
    });
  } catch (error) {
    console.error('Failed to resolve tenant classification:', error);
    return { error: 'Failed to resolve tenant classification' };
  }
}
