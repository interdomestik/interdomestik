import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import type { ActionResult, CommissionSession, CommissionStatus } from '../types';
import { ensureAdminOrStaff } from './access';

/**
 * Valid status transitions:
 * pending -> approved (by admin/staff)
 * approved -> paid (by admin/staff)
 * pending -> void (by admin/staff)
 * approved -> void (by admin/staff)
 */
const VALID_TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ['approved', 'void'],
  approved: ['paid', 'void'],
  paid: [], // Terminal state
  void: [], // Terminal state
};

/** Update commission status (admin/staff only, with transition rules) */
export async function updateCommissionStatusCore(params: {
  session: CommissionSession | null;
  commissionId: string;
  newStatus: CommissionStatus;
}): Promise<ActionResult> {
  const { session, commissionId, newStatus } = params;
  const authError = ensureAdminOrStaff(session);
  if (authError) return authError;

  if (!session) return { success: false, error: 'Unauthorized' };
  const sessionUser = session.user;

  try {
    const tenantId = ensureTenantId(session);

    // Fetch current commission with tenant scoping
    const [commission] = await db
      .select({
        id: agentCommissions.id,
        status: agentCommissions.status,
        agentId: agentCommissions.agentId,
      })
      .from(agentCommissions)
      .where(
        and(
          eq(agentCommissions.id, commissionId),
          eq(agentCommissions.tenantId, tenantId) // SECURITY: Tenant scoping
        )
      )
      .limit(1);

    if (!commission) {
      return { success: false, error: 'Commission not found' };
    }

    // NO SELF-APPROVAL: Agent cannot approve or pay their own commission
    if (
      sessionUser.id === commission.agentId &&
      (newStatus === 'approved' || newStatus === 'paid')
    ) {
      return { success: false, error: 'Cannot approve or pay your own commission' };
    }

    // TRANSITION VALIDATION
    const currentStatus = commission.status as CommissionStatus;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid transition: ${currentStatus} -> ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      };
    }

    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'paid') {
      updateData.paidAt = new Date();
    }

    await db
      .update(agentCommissions)
      .set(updateData)
      .where(and(eq(agentCommissions.id, commissionId), eq(agentCommissions.tenantId, tenantId)));

    console.log(`[Commission] Updated ${commissionId} from ${currentStatus} to ${newStatus}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating commission:', error);
    return { success: false, error: 'Failed to update commission' };
  }
}
