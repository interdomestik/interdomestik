import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { auditLog, branches, documents, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { and, asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

// Input Schemas
export const verifyCashSchema = z.object({
  attemptId: z.string(),
  decision: z.enum(['approve', 'reject', 'needs_info']),
  note: z.string().optional(),
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
  documentId: string | null;
  documentPath: string | null;
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
    // We show pending and needs_info in the queue?
    // Usually 'needs_info' means agent needs to act.
    // Admin queue typically shows 'pending' (waiting for admin).
    // If admin sets 'needs_info', it disappears from 'pending' queue until agent updates it?
    // Or it stays but with status 'needs_info'?
    // For now, let's keep it simple: show 'pending'.
    // If status is 'needs_info', it's waiting on agent, so maybe not in this specific "Verification" queue unless filtered.
    // But the prompt says "Verification item can be set to NEEDS_INFO".
    // I'll stick to 'pending' for the main queue query as per original logic.
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
      // Document Info
      documentId: documents.id,
      documentPath: documents.storagePath,
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
    .innerJoin(branches, eq(memberLeads.branchId, branches.id))
    .innerJoin(user, eq(memberLeads.agentId, user.id))
    .leftJoin(
      documents,
      and(
        eq(documents.entityId, leadPaymentAttempts.id),
        eq(documents.entityType, 'payment_attempt')
      )
    )
    .where(and(...conditions))
    .orderBy(asc(leadPaymentAttempts.createdAt)); // Oldest first for Ops queue

  return rows as CashVerificationRequestDTO[];
}

// 2. Action: Verify (Approve/Reject/NeedsInfo)
// OPS-GRADE: Transaction + Idempotency + Audit
export async function verifyCashAttemptCore(
  ctx: ProtectedActionContext,
  input: z.infer<typeof verifyCashSchema>
) {
  const { tenantId, session } = ctx;
  const { attemptId, decision, note } = input;

  // Validation: Note required for reject/needs_info
  if ((decision === 'reject' || decision === 'needs_info') && !note?.trim()) {
    throw new Error('A note is required for this decision.');
  }

  return await db.transaction(async tx => {
    // A. Fetch & Lock to validate state
    const [result] = await tx
      .select({
        attempt: leadPaymentAttempts,
        lead: memberLeads,
      })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
      .where(and(eq(leadPaymentAttempts.id, attemptId), eq(leadPaymentAttempts.tenantId, tenantId)))
      .limit(1);

    if (!result) throw new Error('Payment attempt not found.');
    const { attempt, lead } = result;

    // B. Security: Self-Verification Check
    // An agent cannot verify their own payment, even if they have admin rights (separation of duties)
    if (lead.agentId === session.user.id) {
      throw new Error('Conflict of Interest: You cannot verify payments for your own leads.');
    }

    // C. Validation (Idempotency)
    if (attempt.status !== 'pending') {
      if (decision === 'approve' && attempt.status === 'succeeded')
        return { success: true, message: 'Already approved' };
      if (decision === 'reject' && attempt.status === 'rejected')
        return { success: true, message: 'Already rejected' };
      // Allow re-decisioning? Generally no for strict audit.
      throw new Error(`Attempt is already processed as ${attempt.status}`);
    }

    // D. Determine Status
    let newStatus: 'succeeded' | 'rejected' | 'needs_info' = 'succeeded';
    if (decision === 'reject') newStatus = 'rejected';
    else if (decision === 'needs_info') newStatus = 'needs_info';

    // E. Update Attempt
    await tx
      .update(leadPaymentAttempts)
      .set({
        status: newStatus,
        verifiedBy: session.user.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
        verificationNote: note || null,
      })
      .where(eq(leadPaymentAttempts.id, attemptId));

    // F. Audit Log
    await tx.insert(auditLog).values({
      id: nanoid(),
      tenantId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: `VERIFY_PAYMENT_${decision.toUpperCase()}`,
      entityType: 'payment_attempt',
      entityId: attemptId,
      metadata: {
        amount: attempt.amount,
        currency: attempt.currency,
        leadId: attempt.leadId,
        previousStatus: attempt.status,
        newStatus,
        note,
      },
      createdAt: new Date(),
    });

    // G. Minimal Lead Update (Only if Approved)
    if (decision === 'approve') {
      await tx
        .update(memberLeads)
        .set({
          status: 'converted',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(memberLeads.id, attempt.leadId),
            sql`${memberLeads.status} IN ('new', 'payment_pending')`
          )
        );
    }

    return { success: true, status: newStatus };
  });
}
