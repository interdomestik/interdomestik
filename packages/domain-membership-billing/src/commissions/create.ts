import { db } from '@interdomestik/database';
import { agentCommissions, user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, CommissionType } from './types';

const VALID_CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP'] as const;

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
    // Validate currency
    const currency = data.currency ?? 'EUR';
    if (!VALID_CURRENCIES.includes(currency as (typeof VALID_CURRENCIES)[number])) {
      return { success: false, error: `Invalid currency: ${currency}` };
    }

    // Normalize amount to 2 decimal places
    const normalizedAmount = Math.round(data.amount * 100) / 100;
    if (normalizedAmount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

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

    // IDEMPOTENCY CHECK: If subscriptionId is provided, check for existing commission
    if (data.subscriptionId) {
      const [existing] = await db
        .select({ id: agentCommissions.id })
        .from(agentCommissions)
        .where(
          and(
            eq(agentCommissions.tenantId, resolvedTenantId),
            eq(agentCommissions.subscriptionId, data.subscriptionId),
            eq(agentCommissions.type, data.type)
          )
        )
        .limit(1);

      if (existing) {
        console.log(
          `[Commission] Idempotent: Commission already exists for subscription ${data.subscriptionId} type ${data.type}`
        );
        return { success: true, data: { id: existing.id } }; // Return existing ID
      }
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
      amount: normalizedAmount.toFixed(2),
      currency,
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
