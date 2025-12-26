'use server';

import { bulkApproveCommissionsCore } from './commissions-admin/bulk-approve';
import { getActionContext } from './commissions-admin/context';
import { getAllCommissionsCore } from './commissions-admin/get-all';
import { getGlobalCommissionSummaryCore } from './commissions-admin/summary';
import { updateCommissionStatusCore } from './commissions-admin/update-status';

import type {
  ActionResult,
  Commission,
  CommissionStatus,
  CommissionSummary,
} from './commissions.types';

/** Get all commissions (admin only) */
export async function getAllCommissions(): Promise<ActionResult<Commission[]>> {
  const { session } = await getActionContext();
  return getAllCommissionsCore({ session });
}

/** Get global commission summary (admin only) */
export async function getGlobalCommissionSummary(): Promise<ActionResult<CommissionSummary>> {
  const { session } = await getActionContext();
  return getGlobalCommissionSummaryCore({ session });
}

/** Update commission status (admin only) */
export async function updateCommissionStatus(
  commissionId: string,
  newStatus: CommissionStatus
): Promise<ActionResult> {
  const { session } = await getActionContext();
  return updateCommissionStatusCore({ session, commissionId, newStatus });
}

/** Bulk approve pending commissions (admin only) */
export async function bulkApproveCommissions(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  const { session } = await getActionContext();
  return bulkApproveCommissionsCore({ session, ids });
}
