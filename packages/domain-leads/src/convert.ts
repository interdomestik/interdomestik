import { and, db, eq } from '@interdomestik/database';
import { generateMemberNumber } from '@interdomestik/database/member-number';
import {
  agentClients,
  memberLeads,
  membershipCards,
  subscriptions,
  user as userTable,
} from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';

export interface ConvertLeadResult {
  userId: string;
  memberNumber: string;
  subscriptionId: string;
}

type LeadConversionState = Pick<typeof memberLeads.$inferSelect, 'status' | 'convertedUserId'>;

function isLeadAlreadyConverted(lead: LeadConversionState): boolean {
  return lead.convertedUserId != null || lead.status === 'converted';
}

function resolveLeadConversionPlanId(planId?: string): string {
  const normalizedPlanId = planId?.trim();
  if (!normalizedPlanId || normalizedPlanId === 'monthly_std') {
    return 'standard';
  }

  return normalizedPlanId;
}

export async function convertLeadToMember(
  ctx: { tenantId: string },
  args: { leadId: string; planId?: string }
): Promise<ConvertLeadResult | null> {
  const { leadId } = args;
  const planId = resolveLeadConversionPlanId(args.planId);

  const lead = await db.query.memberLeads.findFirst({
    where: (l, { eq, and }) => and(eq(l.id, leadId), eq(l.tenantId, ctx.tenantId)),
  });

  if (!lead) throw new Error('Lead not found');
  if (isLeadAlreadyConverted(lead)) return null; // Already done (idempotency)

  const userId = `usr_${nanoid()}`;
  const now = new Date();

  return await db.transaction(async tx => {
    // A. Insert User with role='member'
    await tx.insert(userTable).values({
      id: userId,
      tenantId: ctx.tenantId,
      email: lead.email,
      name: `${lead.firstName} ${lead.lastName}`,
      role: 'member',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      branchId: lead.branchId,
    });

    // B. Generate Member Number (uses canonical generator with retry logic)
    const { memberNumber } = await generateMemberNumber(tx, {
      userId,
      joinedAt: now,
    });

    // C. Create Subscription
    const subscriptionId = `sub_${nanoid()}`;
    await tx.insert(subscriptions).values({
      id: subscriptionId,
      tenantId: ctx.tenantId,
      userId,
      status: 'active',
      planId,
      agentId: lead.agentId,
      branchId: lead.branchId,
      createdAt: now,
      updatedAt: now,
    });

    if (lead.agentId) {
      await tx
        .update(agentClients)
        .set({ status: 'inactive' })
        .where(and(eq(agentClients.tenantId, ctx.tenantId), eq(agentClients.memberId, userId)));

      await tx
        .insert(agentClients)
        .values({
          id: nanoid(),
          tenantId: ctx.tenantId,
          agentId: lead.agentId,
          memberId: userId,
          status: 'active',
          joinedAt: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [agentClients.tenantId, agentClients.agentId, agentClients.memberId],
          set: {
            status: 'active',
            joinedAt: now,
          },
        });
    }

    // D. Issue Membership Card
    const cardNumber = `MEM-${nanoid(8).toUpperCase()}`;
    await tx.insert(membershipCards).values({
      id: `card_${nanoid()}`,
      tenantId: ctx.tenantId,
      userId,
      subscriptionId,
      status: 'active',
      cardNumber,
      qrCodeToken: nanoid(32),
      issuedAt: now,
    });

    // E. Update Lead status
    await tx
      .update(memberLeads)
      .set({ status: 'converted', convertedUserId: userId, updatedAt: now })
      .where(eq(memberLeads.id, leadId));

    return { userId, memberNumber, subscriptionId };
  });
}
