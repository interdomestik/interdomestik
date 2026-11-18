'use server';

import type { ActionResult, Commission, CommissionSummary } from './commissions.types';

import { getActionContext } from './commissions/context';
import { getMyCommissionsCore } from './commissions/get-my';
import { getMyCommissionSummaryCore } from './commissions/summary';

export type { Commission, CommissionSummary } from './commissions.types';

/** Get commissions for the current agent */
export async function getMyCommissions(): Promise<ActionResult<Commission[]>> {
  const { session, authority } = await getActionContext();
  return getMyCommissionsCore({ session, authority });
}

/** Get commission summary for current agent */
export async function getMyCommissionSummary(): Promise<ActionResult<CommissionSummary>> {
  const { session, authority } = await getActionContext();
  return getMyCommissionSummaryCore({ session, authority });
}
