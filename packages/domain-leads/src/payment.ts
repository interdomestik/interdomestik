import { db } from '@interdomestik/database';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { and, eq, ne } from 'drizzle-orm';
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

type StartPaymentContext =
  | { tenantId: string }
  | { tenantId: string; agentId: string; branchId: string };

function buildLeadPaymentScope(ctx: StartPaymentContext, leadId: string) {
  const agentScopeConditions =
    'agentId' in ctx
      ? [eq(memberLeads.agentId, ctx.agentId), eq(memberLeads.branchId, ctx.branchId)]
      : [];
  const conditions = [
    eq(memberLeads.id, leadId),
    eq(memberLeads.tenantId, ctx.tenantId),
    ...agentScopeConditions,
  ];

  const scopedWhere = and(...conditions);
  if (!scopedWhere) {
    throw new Error('Lead not found');
  }

  return scopedWhere;
}

async function markLeadPaymentPending(
  ctx: StartPaymentContext,
  input: StartPaymentInput,
  attemptId: string,
  scopedWhere: NonNullable<ReturnType<typeof buildLeadPaymentScope>>
) {
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  await db.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const updatedRows = await tx
      .update(memberLeads)
      .set({ status: 'payment_pending' })
      .where(and(scopedWhere, ne(memberLeads.status, 'converted')))
      .returning({ id: memberLeads.id });

    if (updatedRows.length === 0) {
      throw new Error('Lead not found');
    }

    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(leadPaymentAttempts).values({
      id: attemptId,
      tenantId: ctx.tenantId,
      leadId: input.leadId,
      method: input.method,
      status: 'pending',
      amount: input.amountCents,
      currency: 'EUR',
    });
  });
}

export async function startPayment(ctx: StartPaymentContext, input: StartPaymentInput) {
  const { leadId, method } = input;
  const scopedWhere = buildLeadPaymentScope(ctx, leadId);

  // 1. Validate Lead
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const lead = await db.query.memberLeads.findFirst({
    where: scopedWhere,
  });

  if (!lead) throw new Error('Lead not found');
  if (lead.status === 'converted') throw new Error('Lead already converted');

  const attemptId = `pay_attempt_${nanoid()}`;

  await markLeadPaymentPending(ctx, input, attemptId, scopedWhere);

  return { attemptId, status: 'pending', method };
}
