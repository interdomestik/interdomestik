import { notifyPaymentVerificationUpdate } from '@/lib/notifications';
import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { auditLog, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { verifyCashSchema } from '../schemas';

// 3. Action: Verify (Approve/Reject/NeedsInfo)
export async function verifyCashAttemptCore(
  ctx: ProtectedActionContext,
  input: z.infer<typeof verifyCashSchema>
) {
  const { tenantId, session } = ctx;
  const { attemptId, decision, note } = input;

  if ((decision === 'reject' || decision === 'needs_info') && !note?.trim()) {
    throw new Error('A note is required for this decision.');
  }

  const txResult = await db.transaction(async tx => {
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
    if (lead.agentId === session.user.id) {
      throw new Error('Conflict of Interest: You cannot verify payments for your own leads.');
    }

    // C. Validation
    if (attempt.status !== 'pending' && attempt.status !== 'needs_info') {
      if (decision === 'approve' && attempt.status === 'succeeded')
        return { success: true, message: 'Already approved', leadId: null, decision };
      if (decision === 'reject' && attempt.status === 'rejected')
        return { success: true, message: 'Already rejected', leadId: null, decision };

      throw new Error(`Attempt is already processed as ${attempt.status}`);
    }

    // D. Status
    let newStatus: 'succeeded' | 'rejected' | 'needs_info' = 'succeeded';
    if (decision === 'reject') newStatus = 'rejected';
    else if (decision === 'needs_info') newStatus = 'needs_info';

    // E. Update
    await tx
      .update(leadPaymentAttempts)
      .set({
        status: newStatus,
        isResubmission: false, // RESET FLAG
        verifiedBy: session.user.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
        verificationNote: note || null,
      })
      .where(eq(leadPaymentAttempts.id, attemptId));

    // F. Audit
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
      await notifyPaymentVerificationUpdate(lead.agentId, agentEmail, {
        leadName: `${lead.firstName} ${lead.lastName}`,
        amount: attempt.amount,
        currency: attempt.currency,
        status: newStatus,
        note: note || undefined,
        link: `/agent/leads`,
      });
    }

    // H. Lead Status Update on Approval
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

    return { success: true, status: newStatus, leadId: attempt.leadId, decision };
  });

  // I. Create Member User (outside tx for better retry semantics)
  if (txResult.decision === 'approve' && txResult.leadId) {
    try {
      const { convertLeadToMember } = await import('@interdomestik/domain-leads/convert');
      const conversionResult = await convertLeadToMember({ tenantId }, { leadId: txResult.leadId });
      if (conversionResult) {
        return {
          success: true,
          status: 'succeeded' as const,
          memberNumber: conversionResult.memberNumber,
          userId: conversionResult.userId,
        };
      }
    } catch (err) {
      console.error('Lead conversion failed:', err);
      // Payment is verified, but conversion failed - log for manual intervention
      // Don't fail the overall verification
    }
  }

  return txResult;
}
