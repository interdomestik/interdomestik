import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { auditLog, branches, documents, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { aliasedTable, and, desc, eq, isNull } from 'drizzle-orm';
import {
  CashVerificationDetailsDTO,
  CashVerificationRequestDTO,
  VerificationTimelineEvent,
} from '../types';

type VerificationDetailsRow = Omit<CashVerificationRequestDTO, 'documentId' | 'documentPath'>;

export async function getVerificationRequestDetails(
  ctx: ProtectedActionContext,
  attemptId: string
): Promise<CashVerificationDetailsDTO | null> {
  const { tenantId, userRole, scope } = ctx;

  const verifier = aliasedTable(user, 'verifier');

  const conditions = [
    eq(leadPaymentAttempts.id, attemptId),
    eq(leadPaymentAttempts.tenantId, tenantId),
  ];

  if (userRole === 'staff' || userRole === 'branch_manager') {
    if (!scope.branchId) return null;
    conditions.push(eq(memberLeads.branchId, scope.branchId));
  }

  // db-access-guard: tenant-scoped -- reason: tenant predicate built in local conditions array before verification details query
  const [row] = (await db
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
      branchId: branches.id,
      branchCode: branches.code,
      branchName: branches.name,
      agentId: user.id,
      agentName: user.name,
      agentEmail: user.email,
      verificationNote: leadPaymentAttempts.verificationNote,
      verifierName: verifier.name,
    })
    .from(leadPaymentAttempts)
    .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
    .innerJoin(branches, eq(memberLeads.branchId, branches.id))
    .innerJoin(user, eq(memberLeads.agentId, user.id))
    .leftJoin(verifier, eq(leadPaymentAttempts.verifiedBy, verifier.id))
    .where(and(...conditions))) as VerificationDetailsRow[];

  if (!row) return null;

  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.entityType, 'payment_attempt'),
        eq(documents.entityId, attemptId),
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt)
      )
    )
    .orderBy(desc(documents.uploadedAt));

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

  const timeline: VerificationTimelineEvent[] = [];

  timeline.push({
    id: `create-${row.id}`,
    type: 'created',
    title: 'Payment Attempt Created',
    description: `Cash payment recorded by ${row.agentName}`,
    date: row.createdAt,
    actorName: row.agentName,
  });

  docs.forEach(d => {
    timeline.push({
      id: `doc-${d.id}`,
      type: 'document_upload',
      title: 'Proof Uploaded',
      description: d.fileName,
      date: d.uploadedAt,
    });
  });

  logs.forEach(l => {
    const meta =
      typeof l.metadata === 'object' && l.metadata !== null
        ? (l.metadata as { note?: unknown })
        : {};
    let title = l.action;
    if (l.action.includes('APPROVE')) title = 'Approved';
    if (l.action.includes('REJECT')) title = 'Rejected';
    if (l.action.includes('NEEDS_INFO')) title = 'Requested Info';
    if (l.action.includes('RESUBMIT')) title = 'Resubmitted';

    timeline.push({
      id: `log-${l.id}`,
      type: 'action',
      title,
      description: typeof meta.note === 'string' ? meta.note : undefined,
      date: l.createdAt!,
      actorName: l.actorName || 'Unknown',
    });
  });

  timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

  const documentList = docs.map(d => ({
    id: d.id,
    name: d.fileName,
    url: `/api/documents/${d.id}/download`,
    uploadedAt: d.uploadedAt,
  }));

  const latestDoc = documentList[0];

  return {
    ...row,
    documentId: latestDoc?.id || null,
    documentPath: null,
    documents: documentList,
    timeline,
  };
}
