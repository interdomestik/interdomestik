import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { branches, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

// Input Schemas
export const verifyCashSchema = z.object({
  attemptId: z.string(),
  decision: z.enum(['approve', 'reject']),
});

export type CashVerificationRequestDTO = {
  id: string; // attemptId
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  currency: string;
  createdAt: Date;
  branchId: string;
  branchCode: string;
  branchName: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
};

// 1. Query: Get Pending Cash Attempts
// OPS-GRADE: Strict tenant + RBAC scoping
export async function getPendingCashAttempts(
  ctx: ProtectedActionContext
): Promise<CashVerificationRequestDTO[]> {
  const { tenantId, userRole, scope } = ctx;

  const conditions = [
    eq(leadPaymentAttempts.tenantId, tenantId),
    eq(leadPaymentAttempts.method, 'cash'),
    eq(leadPaymentAttempts.status, 'pending'),
    // Join condition safety
    eq(memberLeads.id, leadPaymentAttempts.leadId),
  ];

  // RBAC Filter
  if (userRole === 'branch_manager' || userRole === 'staff') {
    // If staff/BM, strictly limit to their branch
    if (!scope.branchId) {
      // Defensive: if no branch assigned, see nothing
      return [];
    }
    conditions.push(eq(memberLeads.branchId, scope.branchId));
  }
  // Tenant Admin / Super Admin see all in tenant (already filtered by tenantId)

  const rows = await db
    .select({
      id: leadPaymentAttempts.id,
      leadId: memberLeads.id,
      firstName: memberLeads.firstName,
      lastName: memberLeads.lastName,
      email: memberLeads.email,
      amount: leadPaymentAttempts.amount,
      currency: leadPaymentAttempts.currency,
      createdAt: leadPaymentAttempts.createdAt,
      // Branch Info
      branchId: branches.id,
      branchCode: branches.code,
      branchName: branches.name,
      // Agent Info
      agentId: user.id,
      agentName: user.name,
      agentEmail: user.email,
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
    .innerJoin(branches, eq(memberLeads.branchId, branches.id))
    .innerJoin(user, eq(memberLeads.agentId, user.id))
    .where(and(...conditions))
    .orderBy(asc(leadPaymentAttempts.createdAt)); // Oldest first for Ops queue

  return rows as CashVerificationRequestDTO[];
}

// 2. Action: Verify (Approve/Reject)
// OPS-GRADE: Transaction + Idempotency + Audit
export async function verifyCashAttemptCore(
  ctx: ProtectedActionContext,
  input: z.infer<typeof verifyCashSchema>
) {
  const { tenantId, session } = ctx;
  const { attemptId, decision } = input;

  return await db.transaction(async tx => {
    // A. Fetch & Lock (or just fetch) to validate state
    const [attempt] = await tx
      .select()
      .from(leadPaymentAttempts)
      .where(and(eq(leadPaymentAttempts.id, attemptId), eq(leadPaymentAttempts.tenantId, tenantId)))
      .limit(1);

    // B. Validation (Idempotency)
    if (!attempt) throw new Error('Payment attempt not found.');
    if (attempt.status !== 'pending') {
      // Idempotent success if already in desired state?
      // If we wanted to approve and it's succeeded, cool.
      // If we wanted to reject and it's rejected, cool.
      if (decision === 'approve' && attempt.status === 'succeeded')
        return { success: true, message: 'Already approved' };
      if (decision === 'reject' && attempt.status === 'rejected')
        return { success: true, message: 'Already rejected' };

      throw new Error(`Attempt is already processed as ${attempt.status}`);
    }

    // C. Determine Updates
    const newStatus = decision === 'approve' ? 'succeeded' : 'rejected';

    // D. Update Attempt
    await tx
      .update(leadPaymentAttempts)
      .set({
        status: newStatus,
        verifiedBy: session.user.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leadPaymentAttempts.id, attemptId));

    // E. Minimal Lead Update (Only if Approved)
    // Rule: We only move lead to 'converted' if it's currently 'new' or 'payment_pending'.
    // We do NOT modify 'disqualified' or existing 'converted'.
    if (decision === 'approve') {
      // We should fetch lead status to be safe, but a direct update with where clause is efficient
      await tx
        .update(memberLeads)
        .set({
          status: 'converted',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(memberLeads.id, attempt.leadId),
            // Only auto-upgrade if waiting for payment
            // Use SQL 'IN' equivalent or explicit checks
            // Safest to strictly target payment_pending or new
            sql`${memberLeads.status} IN ('new', 'payment_pending')`
          )
        );
    }

    return { success: true, status: newStatus };
  });
}
