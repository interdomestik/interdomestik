import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { sql } from 'drizzle-orm';

import type { ActionResult, CommissionSession } from '../types';
import { ensureAdmin } from './access';

/** Bulk approve pending commissions (admin only) */
export async function bulkApproveCommissionsCore(params: {
  session: CommissionSession | null;
  ids: string[];
}): Promise<ActionResult<{ count: number }>> {
  const { session, ids } = params;
  const authError = ensureAdmin(session);
  if (authError) return authError;

  try {
    await db
      .update(agentCommissions)
      .set({ status: 'approved' })
      .where(sql`${agentCommissions.id} IN ${ids} AND ${agentCommissions.status} = 'pending'`);

    return { success: true, data: { count: ids.length } };
  } catch (error) {
    console.error('Error bulk approving:', error);
    return { success: false, error: 'Failed to approve commissions' };
  }
}
