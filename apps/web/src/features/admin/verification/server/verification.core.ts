import { notifyPaymentVerificationUpdate } from '@/lib/notifications';
import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { auditLog, branches, documents, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { aliasedTable, and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
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
  status: string; // Added status for display
  createdAt: Date;
  updatedAt: Date;
  branchId: string;
  branchCode: string;
  branchName: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  documentId: string | null;
  documentPath: string | null;
  verificationNote: string | null;
  verifierName: string | null;
};

export type VerificationView = 'queue' | 'history';

// 1. Query: Get Verification Requests (Queue or History)
// OPS-GRADE: Strict tenant + RBAC scoping + Search + Pagination(limit)
export async function getVerificationRequests(
  ctx: ProtectedActionContext,
  params: { view: VerificationView; query?: string }
): Promise<CashVerificationRequestDTO[]> {
  const { tenantId, userRole, scope } = ctx;
  const { view, query } = params;

  const conditions = [
    eq(leadPaymentAttempts.tenantId, tenantId),
    eq(leadPaymentAttempts.method, 'cash'),
    // Join condition safety
    eq(memberLeads.id, leadPaymentAttempts.leadId),
  ];

  // View Filter
  if (view === 'queue') {
    conditions.push(
      or(eq(leadPaymentAttempts.status, 'pending'), eq(leadPaymentAttempts.status, 'needs_info'))
    );
  } else {
    conditions.push(
      or(eq(leadPaymentAttempts.status, 'succeeded'), eq(leadPaymentAttempts.status, 'rejected'))
    );
  }

  // Search Filter (Lead Name, Email, ID)
  if (query && query.trim().length > 0) {
    const q = `%${query.trim()}%`;
    conditions.push(
      or(
        ilike(memberLeads.firstName, q),
        ilike(memberLeads.lastName, q),
        ilike(memberLeads.email, q),
        ilike(leadPaymentAttempts.id, q)
      )
    );
  }

  // RBAC Filter
  if (userRole === 'branch_manager' || userRole === 'staff') {
    // If staff/BM, strictly limit to their branch
    if (!scope.branchId) {
      return [];
    }
    conditions.push(eq(memberLeads.branchId, scope.branchId));
  }

  // Verifier Alias for History Join
  const verifier = aliasedTable(user, 'verifier');

  let queryBuilder = db
    .select({
      id: leadPaymentAttempts.id,
      leadId: memberLeads.id,
      firstName: memberLeads.firstName,
      lastName: memberLeads.lastName,
      email: memberLeads.email,
      amount: leadPaymentAttempts.amount,
      currency: leadPaymentAttempts.currency,
      status: leadPaymentAttempts.status,
      createdAt: leadPaymentAttempts.createdAt,
      updatedAt: leadPaymentAttempts.updatedAt,
      // Branch Info
      branchId: branches.id,
      branchCode: branches.code,
      branchName: branches.name,
      // Agent Info
      agentId: user.id, // Original 'user' table is Agent via join below
      agentName: user.name,
      agentEmail: user.email,
      // Document Info
      documentId: documents.id,
      documentPath: documents.storagePath,
      // Audit Info
      verificationNote: leadPaymentAttempts.verificationNote,
      verifierName: view === 'history' ? verifier.name : sql<null>`null`,
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
    .innerJoin(branches, eq(memberLeads.branchId, branches.id))
    .innerJoin(user, eq(memberLeads.agentId, user.id)) // Join agent
    .leftJoin(
      documents,
      and(
        eq(documents.entityId, leadPaymentAttempts.id),
        eq(documents.entityType, 'payment_attempt')
      )
    );

  // Conditional Join for Verifier (Only in History)
  if (view === 'history') {
    // We need to cast queryBuilder to any or use a dynamic join construction that TS accepts
    // Drizzle chain allows dynamic joins.
    // @ts-expect-error - dynamic join typing is tricky
    queryBuilder = queryBuilder.leftJoin(verifier, eq(leadPaymentAttempts.verifiedBy, verifier.id));
  }

  // Sorting: Queue = FIFO (Oldest First), History = LIFO (Newest First)
  const orderBy =
    view === 'queue' ? asc(leadPaymentAttempts.createdAt) : desc(leadPaymentAttempts.updatedAt);

  // Limit: Keep UI fast
  const limit = view === 'history' ? 50 : 100;

  // @ts-expect-error - queryBuilder type inference with conditional join
  const rows = await queryBuilder
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit);

  return rows as CashVerificationRequestDTO[];
}

export type VerificationTimelineEvent = {
  id: string;
  type: 'created' | 'document_upload' | 'action';
  title: string;
  description?: string;
  date: Date;
  actorName?: string;
};

export type CashVerificationDetailsDTO = CashVerificationRequestDTO & {
  documents: { id: string; name: string; url: string; uploadedAt: Date }[];
  timeline: VerificationTimelineEvent[];
};

// 2. Query: Get Details with Timeline
export async function getVerificationRequestDetails(
  ctx: ProtectedActionContext,
  attemptId: string
): Promise<CashVerificationDetailsDTO | null> {
  const { tenantId } = ctx;

  // Reuse logic from list query but single item
  // We can just call getVerificationRequests but we need extra joins (documents list, audit log)
  // So better to write specific query.

  const verifier = aliasedTable(user, 'verifier');

  const [row] = await db
    .select({
      // Base DTO
      id: leadPaymentAttempts.id,
      leadId: memberLeads.id,
      firstName: memberLeads.firstName,
      lastName: memberLeads.lastName,
      email: memberLeads.email,
      amount: leadPaymentAttempts.amount,
      currency: leadPaymentAttempts.currency,
      status: leadPaymentAttempts.status,
      createdAt: leadPaymentAttempts.createdAt,
      updatedAt: leadPaymentAttempts.updatedAt,
      branchId: branches.id,
      branchCode: branches.code,
      branchName: branches.name,
      agentId: user.id,
      agentName: user.name,
      agentEmail: user.email,
      verificationNote: leadPaymentAttempts.verificationNote,
      verifierName: verifier.name,
      // We don't select single document here, we fetch all below
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
    .innerJoin(branches, eq(memberLeads.branchId, branches.id))
    .innerJoin(user, eq(memberLeads.agentId, user.id))
    .leftJoin(verifier, eq(leadPaymentAttempts.verifiedBy, verifier.id))
    .where(and(eq(leadPaymentAttempts.id, attemptId), eq(leadPaymentAttempts.tenantId, tenantId)));

  if (!row) return null;

  // Fetch all documents
  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.entityType, 'payment_attempt'),
        eq(documents.entityId, attemptId),
        eq(documents.tenantId, tenantId)
      )
    )
    .orderBy(desc(documents.uploadedAt));

  // Fetch Audit Log for Timeline
  const logs = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      metadata: auditLog.metadata,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(
      and(
        eq(auditLog.entityType, 'payment_attempt'),
        eq(auditLog.entityId, attemptId),
        eq(auditLog.tenantId, tenantId)
      )
    )
    .orderBy(desc(auditLog.createdAt));

  // Construct Timeline
  const timeline: VerificationTimelineEvent[] = [];

  // 1. Creation
  timeline.push({
    id: `create-${row.id}`,
    type: 'created',
    title: 'Payment Attempt Created',
    description: `Cash payment recorded by ${row.agentName}`,
    date: row.createdAt,
    actorName: row.agentName,
  });

  // 2. Documents
  docs.forEach(d => {
    timeline.push({
      id: `doc-${d.id}`,
      type: 'document_upload',
      title: 'Proof Uploaded',
      description: d.fileName,
      date: d.uploadedAt,
      // We could join uploader name but for now assume Agent
    });
  });

  // 3. Actions
  logs.forEach(l => {
    const meta = l.metadata as any;
    let title = l.action;
    if (l.action.includes('APPROVE')) title = 'Approved';
    if (l.action.includes('REJECT')) title = 'Rejected';
    if (l.action.includes('NEEDS_INFO')) title = 'Requested Info';

    timeline.push({
      id: `log-${l.id}`,
      type: 'action',
      title,
      description: meta?.note || undefined,
      date: l.createdAt!,
      actorName: l.actorName || 'Unknown',
    });
  });

  // Sort Descending
  timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Map docs to simple structure
  const documentList = docs.map(d => ({
    id: d.id,
    name: d.fileName,
    url: `/api/documents/${d.id}/download`,
    uploadedAt: d.uploadedAt,
  }));

  // Attach latest doc info to base DTO fields for compatibility
  const latestDoc = documentList[0];

  return {
    ...row,
    documentId: latestDoc?.id || null,
    documentPath: null, // Legacy field, not needed for details
    documents: documentList,
    timeline,
  };
}

// 3. Action: Verify (Approve/Reject/NeedsInfo)
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
        agentEmail: user.email,
      })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
      .innerJoin(user, eq(memberLeads.agentId, user.id))
      .where(and(eq(leadPaymentAttempts.id, attemptId), eq(leadPaymentAttempts.tenantId, tenantId)))
      .limit(1);

    if (!result) throw new Error('Payment attempt not found.');
    const { attempt, lead, agentEmail } = result;

    // B. Security: Self-Verification Check
    // An agent cannot verify their own payment, even if they have admin rights (separation of duties)
    if (lead.agentId === session.user.id) {
      throw new Error('Conflict of Interest: You cannot verify payments for your own leads.');
    }

    // C. Validation (Idempotency)
    // Allow transitioning from 'needs_info' to 'succeeded'/'rejected' if Agent re-submitted?
    // Actually, if it's 'needs_info', it's still "pending" verification action effectively (Agent provided info).
    // The previous logic blocked non-pending.
    // If status is 'needs_info', we SHOULD allow actioning it again (to Approve or Reject).
    // So we allow 'pending' OR 'needs_info'.
    if (attempt.status !== 'pending' && attempt.status !== 'needs_info') {
      if (decision === 'approve' && attempt.status === 'succeeded')
        return { success: true, message: 'Already approved' };
      if (decision === 'reject' && attempt.status === 'rejected')
        return { success: true, message: 'Already rejected' };

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

    // G. Notify Agent (If Needs Info or Rejected)
    if (newStatus === 'needs_info' || newStatus === 'rejected') {
      await notifyPaymentVerificationUpdate(lead.agentId, agentEmail, {
        leadName: `${lead.firstName} ${lead.lastName}`,
        amount: attempt.amount,
        currency: attempt.currency,
        status: newStatus,
        note: note || undefined,
        link: `/agent/leads`,
      });
    }

    // H. Minimal Lead Update (Only if Approved)
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
