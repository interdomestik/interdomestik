import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { branches, documents, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { aliasedTable, and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { CashVerificationRequestDTO, VerificationView } from '../types';

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
    conditions.push(inArray(leadPaymentAttempts.status, ['pending', 'needs_info']));
  } else {
    conditions.push(inArray(leadPaymentAttempts.status, ['succeeded', 'rejected']));
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
      )!
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
      isResubmission: leadPaymentAttempts.isResubmission,
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
        eq(documents.entityType, 'payment_attempt'),
        eq(documents.tenantId, tenantId)
      )
    );

  // Conditional Join for Verifier (Only in History)
  if (view === 'history') {
    // Drizzle chain allows dynamic joins.
    queryBuilder = queryBuilder.leftJoin(verifier, eq(leadPaymentAttempts.verifiedBy, verifier.id));
  }

  // Sorting: Queue = FIFO (Oldest First), History = LIFO (Newest First)
  // For Resubmission: Should bubble to top?
  // Usually Queue is FIFO. But Resubmitted items are "urgent".
  // If we want Resubmitted at top, we sort by isResubmission DESC, then createdAt ASC.
  const orderBy =
    view === 'queue'
      ? [desc(leadPaymentAttempts.isResubmission), asc(leadPaymentAttempts.createdAt)]
      : [desc(leadPaymentAttempts.updatedAt)];

  // Limit: Keep UI fast
  const limit = view === 'history' ? 50 : 100;

  const rows = await queryBuilder
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit);

  return rows as CashVerificationRequestDTO[];
}
