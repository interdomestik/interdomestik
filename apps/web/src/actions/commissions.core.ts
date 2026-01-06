'use server';

import type {
  ActionResult,
  Commission,
  CommissionSummary,
  CommissionType,
} from './commissions.types';

import { getActionContext } from './commissions/context';
import { createCommissionCore } from './commissions/create';
import { getMyCommissionsCore } from './commissions/get-my';
import { getMyCommissionSummaryCore } from './commissions/summary';

export type { Commission, CommissionSummary } from './commissions.types';

/** Get commissions for the current agent */
export async function getMyCommissions(): Promise<ActionResult<Commission[]>> {
  const { session } = await getActionContext();
  return getMyCommissionsCore({ session });
}

/** Get commission summary for current agent */
export async function getMyCommissionSummary(): Promise<ActionResult<CommissionSummary>> {
  const { session } = await getActionContext();
  return getMyCommissionSummaryCore({ session });
}

/** Create a commission record (called from webhook or admin) */
export async function createCommission(data: {
  agentId: string;
  memberId?: string;
  subscriptionId?: string;
  type: CommissionType;
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}): Promise<ActionResult<{ id: string }>> {
  return createCommissionCore(data);
}
