'use server';

import { z } from 'zod';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';

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
import { commissionStatusSchema } from './commissions.types';

const updateCommissionSchema = z
  .object({
    commissionId: z.string().min(1),
    newStatus: commissionStatusSchema,
  })
  .strict();

const bulkApproveSchema = z.array(z.string().min(1)).min(1).max(100);

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
  const { requestHeaders, session } = await getActionContext();

  const validation = updateCommissionSchema.safeParse({ commissionId, newStatus });
  if (!validation.success) {
    return { success: false, error: 'Validation failed' };
  }

  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:commission-status-update:${session.user.id}`,
      limit: 20,
      windowSeconds: 60,
      headers: requestHeaders,
    });
    if (limit.limited) {
      return { success: false, error: 'Too many requests. Please wait a moment.' };
    }
  }

  const result = await updateCommissionStatusCore({
    session,
    commissionId: validation.data.commissionId,
    newStatus: validation.data.newStatus,
  });

  if (result.success) {
    await logAuditEvent({
      actorId: session?.user?.id ?? null,
      actorRole: session?.user?.role ?? null,
      tenantId: session?.user?.tenantId ?? null,
      action: 'commission.status_updated',
      entityType: 'commission',
      entityId: commissionId,
      metadata: { newStatus },
    });
  }

  return result;
}

/** Bulk approve pending commissions (admin only) */
export async function bulkApproveCommissions(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  const { requestHeaders, session } = await getActionContext();

  const validation = bulkApproveSchema.safeParse(ids);
  if (!validation.success) {
    return { success: false, error: 'Validation failed' };
  }

  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:commission-bulk-approve:${session.user.id}`,
      limit: 5,
      windowSeconds: 60,
      headers: requestHeaders,
    });
    if (limit.limited) {
      return { success: false, error: 'Too many requests. Please wait a moment.' };
    }
  }

  const result = await bulkApproveCommissionsCore({ session, ids: validation.data });

  if (result.success) {
    await logAuditEvent({
      actorId: session?.user?.id ?? null,
      actorRole: session?.user?.role ?? null,
      tenantId: session?.user?.tenantId ?? null,
      action: 'commission.bulk_approved',
      entityType: 'commission',
      metadata: { count: validation.data.length },
    });
  }

  return result;
}
