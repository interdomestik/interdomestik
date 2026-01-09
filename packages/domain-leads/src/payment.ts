import { db } from '@interdomestik/database';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
// We might need to import paddle helper if we generate a transaction server-side
// import { getPaddle } from '@interdomestik/domain-membership-billing/paddle-server';

export const startPaymentSchema = z.object({
  leadId: z.string(),
  method: z.enum(['card', 'cash']),
  priceId: z.string(), // The membership price ID (Paddle or internal)
  amountCents: z.number().int().positive(), // For cash references or cross-check
});

export type StartPaymentInput = z.infer<typeof startPaymentSchema>;

export async function startPayment(ctx: { tenantId: string }, input: StartPaymentInput) {
  const { leadId, method, priceId, amountCents } = input;

  // 1. Validate Lead
  const lead = await db.query.memberLeads.findFirst({
    where: (leads, { eq, and }) => and(eq(leads.id, leadId), eq(leads.tenantId, ctx.tenantId)),
  });

  if (!lead) throw new Error('Lead not found');
  if (lead.status === 'converted') throw new Error('Lead already converted');

  const attemptId = `pay_attempt_${nanoid()}`;

  // 2. Handle Cash
  if (method === 'cash') {
    await db.transaction(async tx => {
      await tx.insert(leadPaymentAttempts).values({
        id: attemptId,
        tenantId: ctx.tenantId,
        leadId,
        method: 'cash',
        status: 'pending',
        amount: amountCents,
        currency: 'EUR',
      });

      await tx
        .update(memberLeads)
        .set({ status: 'payment_pending' })
        .where(eq(memberLeads.id, leadId));
    });

    return { attemptId, status: 'pending', method: 'cash' };
  }

  // 3. Handle Card (Paddle)
  // For now, we just record the intent. The actual Transaction object is created by client or server-side SDK.
  // If we need to create a Paddle Transaction here, we would use the Paddle SDK.
  // Let's assume the Client initiates the transaction with Paddle using priceId,
  // and we pass `custom_data: { leadId }` to Paddle.
  // So strictly speaking, we might not strictly NEED a DB record for "intent" unless we want to track it.
  // But verifying says we should.

  await db.transaction(async tx => {
    await tx.insert(leadPaymentAttempts).values({
      id: attemptId,
      tenantId: ctx.tenantId,
      leadId,
      method: 'card',
      status: 'pending',
      amount: amountCents,
      currency: 'EUR',
      // We can create a paddle transaction here if we want server-side generated checkout
    });

    // We don't necessarily move lead to 'payment_pending' yet, or maybe we do?
    // Let's set it to payment_pending to indicate active checkout.
    await tx
      .update(memberLeads)
      .set({ status: 'payment_pending' })
      .where(eq(memberLeads.id, leadId));
  });

  return { attemptId, status: 'pending', method: 'card' };
}
