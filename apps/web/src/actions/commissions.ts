'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { agentCommissions, user as userTable } from '@interdomestik/database/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';

import {
  ActionResult,
  Commission,
  CommissionStatus,
  CommissionSummary,
  CommissionType,
} from './commissions.types';

export type {
  Commission,
  CommissionStatus,
  CommissionSummary,
  CommissionType,
} from './commissions.types';

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Get commissions for the current agent */
export async function getMyCommissions(): Promise<ActionResult<Commission[]>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!['agent', 'staff', 'admin'].includes(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

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
      .where(eq(agentCommissions.agentId, session.user.id))
      .orderBy(desc(agentCommissions.earnedAt));

    // Enrich with names
    const commissions: Commission[] = await Promise.all(
      rows.map(async row => {
        const member = row.memberId
          ? await db.query.user.findFirst({ where: eq(userTable.id, row.memberId) })
          : null;
        return {
          ...row,
          agentName: session.user.name ?? 'Unknown',
          agentEmail: session.user.email,
          memberName: member?.name ?? null,
          memberEmail: member?.email ?? null,
          type: row.type as CommissionType,
          status: row.status as CommissionStatus,
        };
      })
    );

    return { success: true, data: commissions };
  } catch (error) {
    console.error('Error fetching commissions:', error);
    return { success: false, error: 'Failed to fetch commissions' };
  }
}

/** Get commission summary for current agent */
export async function getMyCommissionSummary(): Promise<ActionResult<CommissionSummary>> {
  const session = await getSession();
  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!['agent', 'staff', 'admin'].includes(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

  try {
    const rows = await db
      .select({
        status: agentCommissions.status,
        total: sql<string>`SUM(${agentCommissions.amount})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
      .where(eq(agentCommissions.agentId, session.user.id))
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
    console.error('Error fetching commission summary:', error);
    return { success: false, error: 'Failed to fetch summary' };
  }
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
  try {
    const id = nanoid();
    await db.insert(agentCommissions).values({
      id,
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
