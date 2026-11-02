import { agentCommissions } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq, inArray } from 'drizzle-orm';

import type { ActionResult, CommissionSession } from '../types';
import { formatControlViolation } from '../../enterprise-controls';
import { ensureAdmin } from './access';
import { preflightCommissionPayability } from './payability';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

/** Bulk approve pending commissions (admin only) */
export async function bulkApproveCommissionsCore(params: {
  session: CommissionSession | null;
  authority: TenantAuthority | null;
  ids: string[];
}): Promise<ActionResult<{ count: number }>> {
  const { session, authority, ids } = params;
  const authError = ensureAdmin(session);
  if (authError) return authError;
  if (!session || !authority) return { success: false, error: 'Unauthorized' };

  try {
    const { tenantId } = readTenantAuthority(authority);
    const preflight = await preflightCommissionPayability({ authority, ids });
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

    await withTenantAuthority(authority, tx =>
      tx
        .update(agentCommissions)
        .set({ status: 'approved' })
        .where(
          and(
            eq(agentCommissions.tenantId, tenantId),
            inArray(agentCommissions.id, pendingIds),
            eq(agentCommissions.status, 'pending')
          )
        )
    );

    return { success: true, data: { count: pendingIds.length } };
  } catch (error) {
    console.error('Error bulk approving:', error);
    return { success: false, error: 'Failed to approve commissions' };
  }
}
