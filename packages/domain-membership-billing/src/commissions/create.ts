import { db } from '@interdomestik/database';
import { agentCommissions, user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, CommissionType } from './types';

/** Create a commission record (called from webhook or admin) */
export async function createCommissionCore(data: {
  agentId: string;
  memberId?: string;
  subscriptionId?: string;
  type: CommissionType;
  amount: number;
  currency?: string;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const resolvedTenantId =
      data.tenantId ??
      (
        await db.query.user.findFirst({
          where: eq(user.id, data.agentId),
          columns: { tenantId: true },
        })
      )?.tenantId;

    if (!resolvedTenantId) {
      return { success: false, error: 'Missing tenantId for commission' };
    }

    const id = nanoid();
    await db.insert(agentCommissions).values({
      id,
      tenantId: resolvedTenantId,
      agentId: data.agentId,
      memberId: data.memberId ?? null,
      subscriptionId: data.subscriptionId ?? null,
      type: data.type,
      status: 'pending',
      amount: data.amount.toFixed(2),
      currency: data.currency ?? 'EUR',
      earnedAt: new Date(),
      metadata: data.metadata ?? {},
    });

    console.log(`[Commission] Created commission ${id} for agent ${data.agentId}`);
    return { success: true, data: { id } };
  } catch (error) {
    console.error('Error creating commission:', error);
    return { success: false, error: 'Failed to create commission' };
  }
}
