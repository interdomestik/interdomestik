import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { ActionResult, CommissionType } from './types';

const VALID_CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP'] as const;

type CreateCommissionInput = {
  agentId: string;
  memberId?: string;
  subscriptionId?: string;
  type: CommissionType;
  amount: number;
  currency?: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
};

/** Create a commission record while preserving the public action result shape. */
export async function createCommissionCore(
  data: CreateCommissionInput
): Promise<ActionResult<{ id: string }>> {
  const result = await createCommissionWithDispositionCore(data);
  if (!result.success) return result;
  return { success: true, data: { id: result.data!.id } };
}

/** Create a commission and report whether this call inserted it for webhook audit idempotency. */
export async function createCommissionWithDispositionCore(
  data: CreateCommissionInput
): Promise<ActionResult<{ id: string; created: boolean }>> {
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

    const tenantId = data.tenantId.trim();
    if (!tenantId) {
      return { success: false, error: 'Missing tenantId for commission' };
    }

    // IDEMPOTENCY CHECK: If subscriptionId is provided, check for existing commission
    if (data.subscriptionId) {
      const [existing] = await db
        .select({ id: agentCommissions.id })
        .from(agentCommissions)
        .where(
          and(
            eq(agentCommissions.tenantId, tenantId),
            eq(agentCommissions.subscriptionId, data.subscriptionId),
            eq(agentCommissions.type, data.type)
          )
        )
        .limit(1);

      if (existing) {
        console.log(
          `[Commission] Idempotent: Commission already exists for subscription ${data.subscriptionId} type ${data.type}`
        );
        return { success: true, data: { id: existing.id, created: false } }; // Return existing ID
      }
    }

    const id = nanoid();
    // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
    await db.insert(agentCommissions).values({
      id,
      tenantId,
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
    return { success: true, data: { id, created: true } };
  } catch (error) {
    console.error('Error creating commission:', error);
    return { success: false, error: 'Failed to create commission' };
  }
}
