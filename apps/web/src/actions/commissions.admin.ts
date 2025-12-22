'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { agentCommissions, user as userTable } from '@interdomestik/database/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

import {
  ActionResult,
  Commission,
  CommissionStatus,
  CommissionSummary,
  CommissionType,
} from './commissions.types';

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

function isAdmin(role: string): boolean {
  return role === 'admin';
}

/** Get all commissions (admin only) */
export async function getAllCommissions(): Promise<ActionResult<Commission[]>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };

  try {
    const rows = await db
      .select({
        id: agentCommissions.id,
        agentId: agentCommissions.agentId,
        memberId: agentCommissions.memberId,
        subscriptionId: agentCommissions.subscriptionId,
        type: agentCommissions.type,
        status: agentCommissions.status,
        amount: agentCommissions.amount,
        currency: agentCommissions.currency,
        earnedAt: agentCommissions.earnedAt,
        paidAt: agentCommissions.paidAt,
        metadata: agentCommissions.metadata,
      })
      .from(agentCommissions)
      .orderBy(desc(agentCommissions.earnedAt));

    // Batch fetch user info
    const userIds = [...new Set(rows.flatMap(r => [r.agentId, r.memberId].filter(Boolean)))];
    const users = userIds.length
      ? await db
          .select()
          .from(userTable)
          .where(sql`${userTable.id} IN ${userIds}`)
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const commissions: Commission[] = rows.map(row => {
      const agent = userMap.get(row.agentId);
      const member = row.memberId ? userMap.get(row.memberId) : null;
      return {
        ...row,
        agentName: agent?.name ?? 'Unknown',
        agentEmail: agent?.email ?? '',
        memberName: member?.name ?? null,
        memberEmail: member?.email ?? null,
        type: row.type as CommissionType,
        status: row.status as CommissionStatus,
      };
    });

    return { success: true, data: commissions };
  } catch (error) {
    console.error('Error fetching all commissions:', error);
    return { success: false, error: 'Failed to fetch commissions' };
  }
}

/** Get global commission summary (admin only) */
export async function getGlobalCommissionSummary(): Promise<ActionResult<CommissionSummary>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };

  try {
    const rows = await db
      .select({
        status: agentCommissions.status,
        total: sql<string>`SUM(${agentCommissions.amount})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
      .groupBy(agentCommissions.status);

    const summary: CommissionSummary = {
      totalPending: 0,
      totalApproved: 0,
      totalPaid: 0,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
    };

    for (const row of rows) {
      const amount = parseFloat(row.total || '0');
      const count = Number(row.count);
      if (row.status === 'pending') {
        summary.totalPending = amount;
        summary.pendingCount = count;
      } else if (row.status === 'approved') {
        summary.totalApproved = amount;
        summary.approvedCount = count;
      } else if (row.status === 'paid') {
        summary.totalPaid = amount;
        summary.paidCount = count;
      }
    }

    return { success: true, data: summary };
  } catch (error) {
    console.error('Error fetching global summary:', error);
    return { success: false, error: 'Failed to fetch summary' };
  }
}

/** Update commission status (admin only) */
export async function updateCommissionStatus(
  commissionId: string,
  newStatus: CommissionStatus
): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };

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

/** Bulk approve pending commissions (admin only) */
export async function bulkApproveCommissions(
  ids: string[]
): Promise<ActionResult<{ count: number }>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!isAdmin(session.user.role)) return { success: false, error: 'Admin access required' };

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
