import { ProtectedActionContext } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { auditLog } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { resubmitCashSchema } from '../schemas';

// 4. Action: Resubmit (Agent)
export async function resubmitCashAttemptCore(
  ctx: ProtectedActionContext,
  input: z.infer<typeof resubmitCashSchema>
) {
  const { tenantId, session } = ctx;
  const { attemptId, note } = input;

  return await db.transaction(async tx => {
    // A. Fetch
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

    // B. Security: Only assigned agent
    if (lead.agentId !== session.user.id) {
      throw new Error('Only the assigned agent can resubmit this verification.');
    }

    // C. Validation
    if (attempt.status !== 'needs_info' && attempt.status !== 'rejected') {
      throw new Error(`Cannot resubmit verification with status: ${attempt.status}`);
    }

    // D. Update
    await tx
      .update(leadPaymentAttempts)
      .set({
        status: 'pending',
        isResubmission: true, // SET FLAG
        updatedAt: new Date(),
        // verificationNote: Do not clear admin note? Or clear it?
        // Usually we keep admin note so history shows "Why it was rejected".
        // But status is now pending.
        // I'll keep it.
      })
      .where(eq(leadPaymentAttempts.id, attemptId));

    // E. Audit
    await tx.insert(auditLog).values({
      id: nanoid(),
      tenantId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'PAYMENT_RESUBMITTED',
      entityType: 'payment_attempt',
      entityId: attemptId,
      metadata: {
        note,
        previousStatus: attempt.status,
      },
      createdAt: new Date(),
    });

    return { success: true };
  });
}
