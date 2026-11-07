import { and, eq, issueTenantMemberNumber } from '@interdomestik/database';
import {
  createActiveAnnualMembershipFulfillment,
  createAgentAssistedOwnershipAttribution,
  resolveCanonicalMembershipPlanState,
  revokeAgentClientReadScope,
} from '@interdomestik/domain-membership-billing';
import {
  memberLeads,
  membershipCards,
  subscriptions,
  user as userTable,
} from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';
import { MemberEmailConflictError } from './member-email-conflict';

export * from './member-email-conflict';

export interface ConvertLeadResult {
  userId: string;
  memberNumber: string | null;
  subscriptionId: string;
}

// Only the email uniqueness indexes on "user" are a member email conflict; every other unique
// violation (card number, member number, ids) stays a plain failure.
const MEMBER_EMAIL_UNIQUE_INDEXES = new Set(['user_email_unique', 'user_email_lower_unique']);

function isMemberEmailUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const pg = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (pg.code === '23505') return MEMBER_EMAIL_UNIQUE_INDEXES.has(String(pg.constraint_name));
    current = pg.cause;
  }
  return false;
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

export async function hasTenantLeadForConversion(
  authority: TenantAuthority,
  args: { leadId: string }
): Promise<boolean> {
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: lead ownership is constrained by the authority tenant in the query predicate
  const lead = await withTenantAuthority(authority, tx =>
    tx.query.memberLeads.findFirst({
      where: (l, { eq, and }) => and(eq(l.id, args.leadId), eq(l.tenantId, tenantId)),
      columns: { id: true },
    })
  );

  return Boolean(lead);
}

export async function convertLeadToMember(
  authority: TenantAuthority,
  args: { leadId: string; planId?: string }
): Promise<ConvertLeadResult | null> {
  const { leadId } = args;
  const { tenantId } = readTenantAuthority(authority);
  const planId = resolveLeadConversionPlanId(args.planId);

  const lead = await withTenantAuthority(authority, tx =>
    tx.query.memberLeads.findFirst({
      where: (l, { eq, and }) => and(eq(l.id, leadId), eq(l.tenantId, tenantId)),
    })
  );

  if (!lead) throw new Error('Lead not found');
  // A lead row outside the authority's tenant is never converted.
  if (lead.tenantId !== tenantId) throw new Error('Lead not found');
  if (isLeadAlreadyConverted(lead)) return null; // Already done (idempotency)

  const userId = `usr_${nanoid()}`;
  const email = lead.email.trim().toLowerCase();
  const now = new Date();
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    authority,
    planId,
  });
  const annualMembershipState = createActiveAnnualMembershipFulfillment(
    canonicalPlanState.planId,
    now,
    canonicalPlanState.planKey
  );

  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  const converted = await withTenantAuthority(authority, async tx => {
    // A concurrent approval of the same lead waits here and then sees it converted, so a replay
    // returns no result instead of reporting the member it just created as an email conflict.
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const [locked] = await tx
      .select({ status: memberLeads.status, convertedUserId: memberLeads.convertedUserId })
      .from(memberLeads)
      .where(and(eq(memberLeads.id, leadId), eq(memberLeads.tenantId, tenantId)))
      .for('update');
    if (!locked || isLeadAlreadyConverted(locked)) return null;

    // A. Insert User with role='member'
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(userTable).values({
      id: userId,
      tenantId: tenantId,
      email,
      name: `${lead.firstName} ${lead.lastName}`,
      role: 'member',
      emailVerified: true,
      ...(lead.agentId ? createAgentAssistedOwnershipAttribution(lead.agentId) : {}),
      createdAt: now,
      updatedAt: now,
      branchId: lead.branchId,
    });

    // C. Create Subscription
    const subscriptionId = `sub_${nanoid()}`;
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(subscriptions).values({
      id: subscriptionId,
      tenantId: tenantId,
      userId,
      agentId: lead.agentId,
      branchId: lead.branchId,
      ...annualMembershipState,
      createdAt: now,
      updatedAt: now,
    });

    await revokeAgentClientReadScope(tx, { tenantId: tenantId, memberId: userId });

    // D. Issue Membership Card
    const cardNumber = `MEM-${nanoid(8).toUpperCase()}`;
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(membershipCards).values({
      id: `card_${nanoid()}`,
      tenantId: tenantId,
      userId,
      subscriptionId,
      status: 'active',
      cardNumber,
      qrCodeToken: nanoid(32),
      issuedAt: now,
    });

    // E. Update Lead status
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx
      .update(memberLeads)
      .set({ status: 'converted', convertedUserId: userId, updatedAt: now })
      .where(eq(memberLeads.id, leadId));

    return { userId, subscriptionId };
  }).catch(error => {
    // The transaction has rolled back: no user, subscription or card of this attempt remains.
    if (isMemberEmailUniqueViolation(error)) throw new MemberEmailConflictError();
    throw error;
  });
  if (!converted) return null;

  // The global member number is issued for the committed member on its own connection; a member
  // left without one is completed by the session self-heal.
  const issued = await issueTenantMemberNumber(authority, { userId, joinedAt: now }).catch(
    error => {
      console.error('Member number issuance failed:', error);
      return null;
    }
  );
  return { ...converted, memberNumber: issued?.memberNumber ?? null };
}
