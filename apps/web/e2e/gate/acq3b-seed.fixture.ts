import {
  eq,
  sponsorHandoverIntents,
  sponsorRosterEntries,
  sponsorTerms,
  subscriptions,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ROLES } from '@interdomestik/shared-auth';
import {
  createSponsor,
  createTerm,
  type SponsorResult,
} from '@interdomestik/domain-membership-billing/sponsors/terms';
import { decideRevision } from '@interdomestik/domain-membership-billing/sponsors/decisions';
import {
  optOutToken,
  optOutTokenHash,
  rosterEmailHmac,
} from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import { rosterSecret, type Person, type SponsorFixture } from './acq3b-context.fixture';

export function requireSuccess<T>(result: SponsorResult<T>): T {
  if (!result.ok) throw new Error(`Sponsor fixture failed: ${result.error}`);
  return result.value;
}

export function actor(
  f: SponsorFixture,
  staff = false
): {
  userId: string;
  role: string;
  branchId: string;
  agentTier: string;
} {
  return {
    userId: staff ? f.staff.id : f.agent.id,
    role: staff ? ROLES.staff : ROLES.agent,
    branchId: f.branchId,
    agentTier: 'office',
  };
}

export async function seedSponsor(f: SponsorFixture): Promise<string> {
  return requireSuccess(
    await createSponsor(f.authority, actor(f), {
      leadId: f.leadId,
      legalName: f.prefix,
      registrationNumber: null,
      taxNumber: null,
      billingContactName: 'Synthetic billing contact',
      billingContactEmail: `${f.prefix}-billing@example.com`,
    })
  ).sponsorId;
}

export async function seedTerm(
  f: SponsorFixture,
  sponsorId: string,
  start = f.start,
  end = f.end,
  approve = true,
  staffCreator = false
): Promise<{ termId: string; revisionId: string }> {
  const term = requireSuccess(
    await createTerm(f.authority, actor(f, staffCreator), {
      sponsorId,
      termStart: start,
      termEnd: end,
      legalEntityId: f.entityId,
      planKey: f.planKey,
      revision: {
        seatCount: 4,
        pricePerSeatMinor: 15000,
        currency: 'EUR',
        contractReference: f.prefix,
        termsVersion: 'e2e-v1',
      },
    })
  );
  if (approve)
    requireSuccess(
      await decideRevision(f.authority, actor(f, true), {
        revisionId: term.revisionId,
        decision: 'approved',
        invoiceReference: f.prefix,
      })
    );
  return term;
}

export async function seedEntry(
  f: SponsorFixture,
  termId: string,
  person: Person,
  start: Date | null = f.start,
  outcome: 'seated' | 'awaiting_paid_end' = 'seated'
): Promise<string> {
  const id = `${termId}-${person.name}`;
  await withTenantAuthority(f.authority, tx =>
    tx.insert(sponsorRosterEntries).values({
      id,
      tenantId: f.tenantId,
      termId,
      firstName: person.name,
      lastName: 'Employee',
      emailNormalized: person.email,
      emailHmac: rosterEmailHmac(rosterSecret, person.email),
      userId: person.id,
      conflictDecision: 'accepted',
      conflictDecidedAt: f.now.toISOString(),
      addedBy: f.agent.id,
      startsAt: start?.toISOString() ?? null,
      outcome,
      optoutTokenHash: optOutTokenHash(optOutToken(rosterSecret, id)),
    })
  );
  return id;
}

export async function seedSubscription(
  f: SponsorFixture,
  person: Person,
  paddle = false
): Promise<void> {
  await withTenantAuthority(f.authority, tx =>
    tx.insert(subscriptions).values({
      id: `${person.id}-subscription`,
      tenantId: f.tenantId,
      userId: person.id,
      status: 'active',
      planId: f.planId,
      planKey: f.planKey,
      provider: paddle ? 'paddle' : 'group_sponsor',
      providerSubscriptionId: paddle ? `sub_${person.id}` : null,
      currentPeriodStart: f.start,
      currentPeriodEnd: paddle ? f.paidEnd : f.end,
      branchId: f.branchId,
      legalEntityId: f.entityId,
    })
  );
}

// Durable paid-until evidence is fixture input, never a call to Paddle or a mail sender.
export async function seedHandover(
  f: SponsorFixture,
  entryId: string,
  review = false
): Promise<string> {
  const id = `${f.prefix}-handover`;
  await withTenantAuthority(f.authority, async tx => {
    await tx.insert(sponsorHandoverIntents).values({
      id,
      tenantId: f.tenantId,
      userId: f.paying.id,
      subscriptionId: `${f.paying.id}-subscription`,
      providerSubscriptionId: `sub_${f.paying.id}`,
      state: review ? 'staff_review' : 'cancel_scheduled',
      paidUntil: review ? null : f.paidEnd.toISOString(),
      paidUntilEvidence: review ? null : `txn_${f.prefix}`,
    });
    await tx
      .update(sponsorRosterEntries)
      .set({ handoverIntentId: id })
      .where(eq(sponsorRosterEntries.id, entryId));
  });
  return id;
}

export async function readEntry(
  f: SponsorFixture,
  id: string
): Promise<typeof sponsorRosterEntries.$inferSelect> {
  const entry = await withTenantAuthority(f.authority, tx =>
    tx.query.sponsorRosterEntries.findFirst({
      where: eq(sponsorRosterEntries.id, id),
    })
  );
  if (!entry) throw new Error(`Missing owned entry ${id}`);
  return entry;
}

export async function readTerms(
  f: SponsorFixture,
  sponsorId: string
): Promise<(typeof sponsorTerms.$inferSelect)[]> {
  return withTenantAuthority(f.authority, tx =>
    tx.select().from(sponsorTerms).where(eq(sponsorTerms.sponsorId, sponsorId))
  );
}
