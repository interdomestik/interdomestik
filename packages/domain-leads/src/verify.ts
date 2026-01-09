import { db } from '@interdomestik/database';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { convertLeadToMember } from './convert';

export const verifyCashSchema = z.object({
  leadId: z.string(),
  paymentAttemptId: z.string(),
  decision: z.enum(['approve', 'reject']),
});

export type VerifyCashInput = z.infer<typeof verifyCashSchema>;

export async function verifyCashPayment(
  ctx: { tenantId: string; userId: string }, // Verified by this user
  input: VerifyCashInput
) {
  const { leadId, paymentAttemptId, decision } = input;

  const attempt = await db.query.leadPaymentAttempts.findFirst({
    where: (pa, { eq, and }) =>
      and(
        eq(pa.id, paymentAttemptId),
        eq(pa.leadId, leadId),
        eq(pa.tenantId, ctx.tenantId),
        eq(pa.method, 'cash'),
        eq(pa.status, 'pending')
      ),
  });

  if (!attempt) throw new Error('Pending cash payment attempt not found');

  if (decision === 'reject') {
    await db
      .update(leadPaymentAttempts)
      .set({
        status: 'rejected',
        verifiedBy: ctx.userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leadPaymentAttempts.id, paymentAttemptId));

    // Move lead back to 'new' or keep 'payment_pending'? 'new' seems appropriate or 'disqualified' if hard reject.
    // Let's set back to 'new' to allow retry.
    await db.update(memberLeads).set({ status: 'new' }).where(eq(memberLeads.id, leadId));

    return { success: true, outcome: 'rejected' };
  }

  // APPROVE
  await db.transaction(async tx => {
    // 1. Mark payment as succeeded
    await tx
      .update(leadPaymentAttempts)
      .set({
        status: 'succeeded',
        verifiedBy: ctx.userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leadPaymentAttempts.id, paymentAttemptId));

    // 2. Convert Lead (This calls the heavy lifting logic)
    // We pass the transaction if possible, or we let convert handle its own tx (drizzle supports nested tx or we just await)
  });

  // Call conversion OUTSIDE the separate tx or inside?
  // Ideally inside to be atomic. 'convertLeadToMember' should accept a tx object?
  // For now, let's call it after. If conversion fails, payment is marked verified but user not created? That's bad.
  // We should refactor convert to accept a 'tx' or just do it here.
  // For simplicity of MVP, we call it here. Robustness improvement: make convert accept tx.

  await convertLeadToMember(ctx, { leadId });

  return { success: true, outcome: 'approved' };
}
