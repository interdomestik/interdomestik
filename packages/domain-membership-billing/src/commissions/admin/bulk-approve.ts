import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq, inArray } from 'drizzle-orm';

import type { ActionResult, CommissionSession } from '../types';
import { formatControlViolation } from '../../enterprise-controls';
import { ensureAdmin } from './access';
import { preflightCommissionPayability } from './payability';

/** Bulk approve pending commissions (admin only) */
export async function bulkApproveCommissionsCore(params: {
  session: CommissionSession | null;
  ids: string[];
}): Promise<ActionResult<{ count: number }>> {
  const { session, ids } = params;
  const authError = ensureAdmin(session);
  if (authError) return authError;
  if (!session) return { success: false, error: 'Unauthorized' };

  try {
    const tenantId = ensureTenantId(session);
    const preflight = await preflightCommissionPayability({ tenantId, ids });
    if (!preflight.ok) {
      return {
        success: false,
        error: formatControlViolation(preflight.violation),
        violation: preflight.violation,
      };
    }

    const pendingIds = preflight.value.filter(row => row.status === 'pending').map(row => row.id);
    if (pendingIds.length === 0) {
      return { success: true, data: { count: 0 } };
    }

    await db
      .update(agentCommissions)
      .set({ status: 'approved' })
      .where(
        and(
          eq(agentCommissions.tenantId, tenantId),
          inArray(agentCommissions.id, pendingIds),
          eq(agentCommissions.status, 'pending')
        )
      );

    return { success: true, data: { count: pendingIds.length } };
  } catch (error) {
    console.error('Error bulk approving:', error);
    return { success: false, error: 'Failed to approve commissions' };
  }
}
