import { notifyPaymentVerificationUpdate } from '@/lib/notifications';
import { isMemberEmailConflictError } from '@interdomestik/domain-leads/member-email-conflict';
import { ProtectedActionContext } from '@/lib/safe-action';

import { auditLog, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { verifyCashSchema } from '../schemas';
import {
  resolveVerificationReadScope,
  withSessionStaffBranch,
  type VerificationReadScope,
} from '../queries/read-access';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type Decision = z.infer<typeof verifyCashSchema>['decision'];

const DECISION_STATUS = {
  approve: 'succeeded',
  reject: 'rejected',
  needs_info: 'needs_info',
} as const satisfies Record<Decision, string>;

/** Refuses a lead outside the staff branch (as not found) and a decision on one's own lead. */
function assertDecisionAdmitted(
  scope: VerificationReadScope,
  lead: { branchId: string | null; agentId: string },
  actorId: string
): void {
  if (scope.kind === 'branch' && lead.branchId !== scope.branchId) {
    throw new Error('Payment attempt not found.');
  }
  if (lead.agentId === actorId) {
    throw new Error('Conflict of Interest: You cannot verify payments for your own leads.');
  }
}

/** The answer to repeating a closed attempt's own decision; any other change is refused. */
function repeatedDecision(attempt: { status: string; leadId: string }, decision: Decision) {
  // A repeated approval retries the idempotent member conversion that may not have completed.
  if (decision === 'approve' && attempt.status === 'succeeded')
    return { success: true, message: 'Already approved', leadId: attempt.leadId, decision };
  if (decision === 'reject' && attempt.status === 'rejected')
    return { success: true, message: 'Already rejected', leadId: null, decision };
  throw new Error(`Attempt is already processed as ${attempt.status}`);
}

type PendingFulfillment = {
  fulfillment: 'pending';
  reason?: 'member_email_conflict';
  message: string;
};

/** An approved payment whose member setup did not complete; logged without the member's email. */
function pendingFulfillment(leadId: string, err: unknown): PendingFulfillment {
  const conflict = isMemberEmailConflictError(err);
  // Redacted: SQL parameters and conflict details can carry the member's email.
  console.error('Lead conversion failed', {
    leadId,
    reason: conflict ? 'member_email_conflict' : ((err as Error | null)?.name ?? 'unknown'),
  });
  // The payment stays verified and the lead stays 'paid'; approving again retries the setup.
  // An email that already has an account is never attached: an operator reconciles it.
  if (!conflict)
    return { fulfillment: 'pending', message: 'Payment approved; membership setup is pending.' };
  return {
    fulfillment: 'pending',
    reason: 'member_email_conflict',
    message: 'Payment approved; the email already belongs to an account and needs reconciliation.',
  };
}

// 3. Action: Verify (Approve/Reject/NeedsInfo)
export async function verifyCashAttemptCore(
  ctx: ProtectedActionContext,
  input: z.infer<typeof verifyCashSchema>
) {
  const { tenantId, session, authority } = ctx;
  const { attemptId, decision, note } = input;

  if ((decision === 'reject' || decision === 'needs_info') && !note?.trim()) {
    throw new Error('A note is required for this decision.');
  }

  // Decisions need the same operations role and branch admission as verification reads.
  const scope = resolveVerificationReadScope(withSessionStaffBranch(ctx));
  if (scope.kind === 'none') throw new Error('Payment attempt not found.');

  const txResult = await withTenantAuthority(authority, async tx => {
    // A. Fetch
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

    // B. Security
    assertDecisionAdmitted(scope, lead, session.user.id);

    // C. Validation
    if (attempt.status !== 'pending' && attempt.status !== 'needs_info') {
      return repeatedDecision(attempt, decision);
    }

    // D. Status
    const newStatus = DECISION_STATUS[decision];

    // E. Update: only one decision can move an open attempt; a concurrent loser changes nothing.
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const decided = await tx
      .update(leadPaymentAttempts)
      .set({
        status: newStatus,
        isResubmission: false, // RESET FLAG
        verifiedBy: session.user.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
        verificationNote: note || null,
      })
      .where(
        and(
          eq(leadPaymentAttempts.id, attemptId),
          inArray(leadPaymentAttempts.status, ['pending', 'needs_info'])
        )
      )
      .returning({ id: leadPaymentAttempts.id });
    if (decided.length === 0) {
      throw new Error('This payment attempt was just decided by someone else. Reload and retry.');
    }

    // F. Audit
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
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

    // G. Notify
    if (newStatus === 'needs_info' || newStatus === 'rejected') {
      await notifyPaymentVerificationUpdate(
        lead.agentId,
        agentEmail,
        {
          leadName: `${lead.firstName} ${lead.lastName}`,
          amount: attempt.amount,
          currency: attempt.currency,
          status: newStatus,
          note: note || undefined,
          link: `/agent/leads`,
        },
        { authority }
      );
    }

    // H. Lead Status Update on Approval: the payment is verified ('paid'). Only the member
    // conversion below marks the lead 'converted', together with its converted user.
    if (decision === 'approve') {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      await tx
        .update(memberLeads)
        .set({
          status: 'paid',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(memberLeads.id, attempt.leadId),
            sql`${memberLeads.status} IN ('new', 'payment_pending')`
          )
        );
    }

    return { success: true, status: newStatus, leadId: attempt.leadId, decision };
  });

  // I. Create Member User (outside tx for better retry semantics)
  if (txResult.decision === 'approve' && txResult.leadId) {
    try {
      const { convertLeadToMember } = await import('@interdomestik/domain-leads/convert');
      const conversionResult = await convertLeadToMember(authority, { leadId: txResult.leadId });
      if (conversionResult) {
        return {
          success: true,
          status: 'succeeded' as const,
          memberNumber: conversionResult.memberNumber,
          userId: conversionResult.userId,
        };
      }
    } catch (err) {
      return { ...txResult, ...pendingFulfillment(txResult.leadId, err) };
    }
  }

  return txResult;
}
