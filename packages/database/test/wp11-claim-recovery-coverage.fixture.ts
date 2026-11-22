import { and, eq } from 'drizzle-orm';

import {
  branches,
  claimEscalationAgreements,
  claimRecoveryNoFeeEvidence,
  legalEntities,
  memberLeads,
  membershipPlans,
  serviceUsage,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  subscriptions,
} from '../src/schema';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';
import type { StatusFixture } from './wp11-claim-status-rls.fixture';

export async function seedRecoveryClaim(fixture: StatusFixture) {
  const { adminDb, staffId, newId } = fixture;
  const claimId = await fixture.newClaim('evaluation', staffId);
  const now = new Date();
  const agreementId = newId('wp11_agreement');
  await adminDb.insert(claimEscalationAgreements).values({
    id: agreementId,
    tenantId: KS_TENANT_ID,
    claimId,
    acceptedById: staffId,
    acceptedAt: now,
    decisionType: 'accepted',
    decisionNextStatus: 'negotiation',
    signedAt: now,
    legalActionCapPercentage: 25,
    feePercentage: 15,
    minimumFee: '10.00',
    termsVersion: 'v1',
    paymentAuthorizationState: 'authorized',
    successFeeCollectionMethod: 'invoice',
    successFeeDeductionAllowed: false,
    successFeeHasStoredPaymentMethod: false,
    successFeeInvoiceDueAt: now,
    successFeeResolvedAt: now,
    successFeeRecoveredAmount: '250.00',
    successFeeAmount: '37.50',
    successFeeCurrencyCode: 'EUR',
  });
  const evidenceId = newId('wp11_evidence');
  await adminDb.insert(claimRecoveryNoFeeEvidence).values({
    id: evidenceId,
    tenantId: KS_TENANT_ID,
    claimId,
    reasonCode: 'no_recovery',
    documentedById: staffId,
  });
  return { claimId, agreementId, evidenceId };
}

export type SponsorStatusState = {
  bound: boolean;
  accepted: boolean;
  termEnd?: Date;
  subscription?: { provider: 'paddle'; planId: 'family'; exhaustAllowance: boolean };
};

function sponsorFixture(fixture: StatusFixture, state: SponsorStatusState) {
  const { adminDb, ownerId, staffId, newId } = fixture;
  const tenant = { tenantId: KS_TENANT_ID };
  const id = (name: string) => newId(`wp11_${name}`);
  const branchId = id('branch');
  const leadId = id('lead');
  const entityId = id('entity');
  const planId = id('plan');
  const sponsorId = id('sponsor');
  const termId = id('term');
  const revisionId = id('revision');
  const decisionId = id('decision');
  const entryId = id('entry');
  const subscriptionId = id('subscription');
  const now = new Date();
  const start = new Date(now.getTime() - 86400000).toISOString();
  const end = (state.termEnd ?? new Date(now.getTime() + 86400000)).toISOString();

  async function seed() {
    await adminDb
      .insert(branches)
      .values({ ...tenant, id: branchId, name: 'Test branch', slug: branchId });
    await adminDb.insert(memberLeads).values({
      ...tenant,
      id: leadId,
      branchId,
      agentId: ownerId,
      firstName: 'Test',
      lastName: 'Company',
      email: `${leadId}@example.test`,
      phone: '000000000',
      leadKind: 'company',
      companyName: 'Test',
      consentNoticeVersion: 'p1-agent-notice-v1',
      consentCapturedAt: now,
      consentCapturedBy: ownerId,
      captureChannel: 'agent_assisted',
      updatedAt: now,
    });
    await adminDb
      .insert(legalEntities)
      .values({ ...tenant, id: entityId, legalName: 'Test', countryCode: 'XK' });
    await adminDb.insert(membershipPlans).values({
      ...tenant,
      id: planId,
      name: 'Test plan',
      tier: 'standard',
      price: '100.00',
      updatedAt: now,
    });
    await adminDb.insert(subscriptions).values({
      ...tenant,
      id: subscriptionId,
      userId: ownerId,
      planId: state.subscription?.planId ?? 'standard',
      planKey: planId,
      provider: state.subscription?.provider ?? 'group_sponsor',
      currentPeriodStart: new Date(start),
      currentPeriodEnd: new Date(end),
    });
    await adminDb.insert(sponsors).values({
      ...tenant,
      id: sponsorId,
      branchId,
      sourceLeadId: leadId,
      legalName: 'Test sponsor',
      billingContactName: 'Test',
      billingContactEmail: `${sponsorId}@example.test`,
      createdBy: ownerId,
    });
    await adminDb.insert(sponsorTerms).values({
      ...tenant,
      id: termId,
      sponsorId,
      termStart: start,
      termEnd: end,
      legalEntityId: entityId,
      planKey: planId,
      planId: 'standard',
      createdBy: ownerId,
    });
    await adminDb.insert(sponsorTermRevisions).values({
      ...tenant,
      id: revisionId,
      termId,
      revision: 1,
      seatCount: 2,
      pricePerSeatMinor: 100,
      currency: 'EUR',
      contractReference: 'WP-11 test',
      termsVersion: 'v1',
      createdBy: ownerId,
    });
    await adminDb.insert(sponsorRevisionDecisions).values({
      ...tenant,
      id: decisionId,
      revisionId,
      decision: 'approved',
      decidedBy: staffId,
    });
    await adminDb.insert(sponsorRosterEntries).values({
      ...tenant,
      id: entryId,
      termId,
      userId: state.bound ? ownerId : null,
      startsAt: start,
      conflictDecision: state.accepted ? 'accepted' : null,
      conflictDecidedAt: state.accepted ? start : null,
      outcome: 'seated',
      addedBy: ownerId,
    });
    if (state.subscription?.exhaustAllowance) await exhaustAllowance();
  }

  async function exhaustAllowance() {
    await adminDb.insert(serviceUsage).values(
      ['one', 'two'].map(code => ({
        ...tenant,
        id: id('usage'),
        userId: ownerId,
        subscriptionId,
        serviceCode: `staff_recovery_matter:${code}`,
        usedAt: now,
      }))
    );
  }

  async function cleanup() {
    await adminDb.delete(serviceUsage).where(eq(serviceUsage.subscriptionId, subscriptionId));
    await adminDb.delete(sponsorRosterEntries).where(eq(sponsorRosterEntries.id, entryId));
    await adminDb
      .delete(sponsorRevisionDecisions)
      .where(eq(sponsorRevisionDecisions.id, decisionId));
    await adminDb.delete(sponsorTermRevisions).where(eq(sponsorTermRevisions.id, revisionId));
    await adminDb.delete(sponsorTerms).where(eq(sponsorTerms.id, termId));
    await adminDb.delete(sponsors).where(eq(sponsors.id, sponsorId));
    await adminDb.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
    await adminDb.delete(membershipPlans).where(eq(membershipPlans.id, planId));
    await adminDb.delete(legalEntities).where(eq(legalEntities.id, entityId));
    await adminDb.delete(memberLeads).where(eq(memberLeads.id, leadId));
    await adminDb
      .delete(branches)
      .where(and(eq(branches.tenantId, KS_TENANT_ID), eq(branches.id, branchId)));
  }

  return { seed, cleanup, entryId, termId, planId, subscriptionId };
}

export type SponsorStatusFixture = ReturnType<typeof sponsorFixture>;

export async function withSponsorStatusFixture(
  fixture: StatusFixture,
  state: SponsorStatusState,
  run: (sponsor: SponsorStatusFixture) => Promise<void>
) {
  const sponsor = sponsorFixture(fixture, state);
  try {
    await sponsor.seed();
    await run(sponsor);
  } finally {
    await sponsor.cleanup();
  }
}
