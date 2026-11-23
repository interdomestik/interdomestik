import {
  db,
  E2E_USERS,
  eq,
  leadPaymentAttempts,
  memberLeads,
  membershipCards,
  subscriptions,
  user,
} from '@interdomestik/database';
import { expect } from '@playwright/test';

export type OwnedLead = { id: string; email: string };

/**
 * Inserts a `new` member lead owned by the seeded agent of `tenant`, in that agent's branch, so a
 * test reads or drives a lead whose state no other test depends on.
 *
 * `idPrefix` must stay outside the seed cleanup prefixes (`golden_`, `pack_ks_`, `member_`): a
 * converted lead keeps app-created rows (attempt, member) that the prefix cleanup does not own, and
 * the reseed would not remove the member it was converted into. Callers remove the lead with
 * `removeOwnedMemberLead`.
 */
export async function insertOwnedMemberLead(
  tenant: 'ks' | 'mk',
  idPrefix: string,
  lastName: string
): Promise<OwnedLead> {
  const agentEmail = tenant === 'mk' ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
  const agent = await db.query.user.findFirst({ where: eq(user.email, agentEmail) });
  expect(agent?.branchId, `seeded ${tenant} agent with a branch`).toBeTruthy();
  const id = `${idPrefix}_${tenant}_${Date.now()}`;
  const email = `${id}@example.com`;
  await db.insert(memberLeads).values({
    id,
    tenantId: agent!.tenantId,
    branchId: agent!.branchId!,
    agentId: agent!.id,
    firstName: 'E2E',
    lastName,
    email,
    phone: '+38970888888',
    status: 'new',
    // An agent-captured lead carries the consent its agent recorded (member_leads_consent_check).
    consentNoticeVersion: 'e2e-agent-notice-v1',
    consentCapturedAt: new Date(),
    consentCapturedBy: agent!.id,
    captureChannel: 'agent_assisted',
  });
  return { id, email };
}

/**
 * Removes an owned lead and every row the app derived from it: its payment attempts and, when it
 * was converted, the member's card, subscription and user. One transaction, so a failure leaves the
 * graph whole for the next attempt instead of half-deleted.
 */
export async function removeOwnedMemberLead(lead: OwnedLead | undefined): Promise<void> {
  if (!lead) return;
  await db.transaction(async tx => {
    const [row] = await tx
      .select({ convertedUserId: memberLeads.convertedUserId })
      .from(memberLeads)
      .where(eq(memberLeads.id, lead.id));
    await tx.delete(leadPaymentAttempts).where(eq(leadPaymentAttempts.leadId, lead.id));
    await tx.delete(memberLeads).where(eq(memberLeads.id, lead.id));
    const memberId = row?.convertedUserId;
    if (!memberId) return;
    await tx.delete(membershipCards).where(eq(membershipCards.userId, memberId));
    await tx.delete(subscriptions).where(eq(subscriptions.userId, memberId));
    await tx.delete(user).where(eq(user.id, memberId));
  });
}
