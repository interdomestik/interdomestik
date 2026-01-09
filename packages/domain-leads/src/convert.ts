import { db } from '@interdomestik/database';
import {
  memberLeads,
  membershipCards,
  subscriptions,
  user as userTable,
} from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function convertLeadToMember(
  ctx: { tenantId: string },
  args: { leadId: string; planId?: string }
) {
  const { leadId, planId = 'monthly_std' } = args;

  const lead = await db.query.memberLeads.findFirst({
    where: (l, { eq, and }) => and(eq(l.id, leadId), eq(l.tenantId, ctx.tenantId)),
  });

  if (!lead) throw new Error('Lead not found');
  if (lead.status === 'converted') return; // Already done (idempotency)

  // 1. Create User Account (Shadow user / Member)
  // We need a userId.
  const userId = `usr_${nanoid()}`;

  await db.transaction(async tx => {
    // A. Insert User
    await tx.insert(userTable).values({
      id: userId,
      tenantId: ctx.tenantId,
      email: lead.email,
      name: `${lead.firstName} ${lead.lastName}`,
      role: 'member',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      // branchId might handle branch scoping for members?
      branchId: lead.branchId,
    });

    // B. Create Subscription
    // We need plan details. For MVP, we might default or need it from the leads table?
    // Wait, startPayment had priceId/amount, but where is it stored?
    // We should explicitly store 'planId' on lead or payment attempt.
    // For now, let's assume a default/placeholder or fetch active default.
    const subscriptionId = `sub_${nanoid()}`;
    await tx.insert(subscriptions).values({
      id: subscriptionId,
      tenantId: ctx.tenantId,
      userId: userId,
      status: 'active',
      planId: planId,
      agentId: lead.agentId, // Attribution
      branchId: lead.branchId,
      createdAt: new Date(),
    });

    // C. Issue Membership Card
    const cardNumber = `MEM-${nanoid(8).toUpperCase()}`;
    await tx.insert(membershipCards).values({
      id: `card_${nanoid()}`,
      tenantId: ctx.tenantId,
      userId: userId,
      subscriptionId: subscriptionId,
      status: 'active',
      cardNumber,
      qrCodeToken: nanoid(32),
      issuedAt: new Date(),
    });

    // D. Update Lead status
    await tx
      .update(memberLeads)
      .set({ status: 'converted', convertedUserId: userId, updatedAt: new Date() })
      .where(eq(memberLeads.id, leadId));
  });
}
