import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import type { ActionResult, CommissionStatus } from '../commissions.types';
import { ensureAdmin } from './access';
import type { Session } from './context';

/** Update commission status (admin only) */
export async function updateCommissionStatusCore(params: {
  session: NonNullable<Session> | null;
  commissionId: string;
  newStatus: CommissionStatus;
}): Promise<ActionResult> {
  const { session, commissionId, newStatus } = params;
  const authError = ensureAdmin(session);
  if (authError) return authError;

  try {
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'paid') {
      updateData.paidAt = new Date();
    }

    await db.update(agentCommissions).set(updateData).where(eq(agentCommissions.id, commissionId));

    console.log(`[Commission] Updated ${commissionId} to ${newStatus}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating commission:', error);
    return { success: false, error: 'Failed to update commission' };
  }
}
