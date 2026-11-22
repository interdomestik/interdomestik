import type { openPilotSalesContract } from '@/actions/pilot-sales.contract-test-support';
import { PILOT_SWITCH_CATEGORY } from '@interdomestik/database/pilot-switch';
import {
  auditLog,
  branches,
  legalEntities,
  memberLeads,
  membershipPlans,
  sponsorMailOutbox,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  subscriptions,
  tenantSettings,
  user,
} from '@interdomestik/database/schema';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export type Contract = Awaited<ReturnType<typeof openPilotSalesContract>>;
export type AdminDb = Contract['dbAdmin'];

export function sponsorFixture(params: {
  tenantId: 'tenant_ks' | 'tenant_mk';
  enabled: boolean;
  termCount: number;
  entryCount?: number;
  year: number;
}) {
  const prefix = `pilot-sponsor-${randomUUID()}`;
  const { tenantId, year } = params;
  const creatorId = `${prefix}-creator`;
  const staffId = `${prefix}-staff`;
  const operatorId = `${prefix}-operator`;
  const terms = Array.from({ length: params.termCount }, (_unused, index) => ({
    id: `${prefix}-term-${index}`,
    revisionId: `${prefix}-revision-${index}`,
    start: new Date(Date.UTC(year + index, 0, 1)).toISOString(),
    end: new Date(Date.UTC(year + index + 1, 0, 1)).toISOString(),
  }));
  const entries = Array.from({ length: params.entryCount ?? 0 }, (_unused, index) => {
    const id = `${prefix}-entry-${index}`;
    return { id, email: `${id}@example.test` };
  });
  return {
    prefix,
    tenantId,
    enabled: params.enabled,
    creatorId,
    staffId,
    operatorId,
    branchId: `${prefix}-branch`,
    planKey: `${prefix}-plan`,
    leadId: `${prefix}-lead`,
    sponsorId: `${prefix}-company`,
    terms,
    entries,
    work: mintTestTenantAuthority(tenantId),
    operator: mintTestTenantAuthority(tenantId, { userId: operatorId, role: 'super_admin' }),
    staff: mintTestTenantAuthority(tenantId, { userId: staffId, role: 'staff' }),
  };
}

export type Fixture = ReturnType<typeof sponsorFixture>;
export type Term = Fixture['terms'][number];

function fixtureSettings(fixture: Fixture) {
  const { prefix, tenantId, enabled } = fixture;
  const settings = [
    {
      id: `${prefix}-new-sales`,
      tenantId,
      category: PILOT_SWITCH_CATEGORY,
      key: 'new_sales',
      value: { enabled, revision: 1 },
    },
  ];
  if (fixture.entries.length > 0) {
    settings.push({
      id: `${prefix}-sponsored-import`,
      tenantId,
      category: 'acquisition',
      key: 'sponsored_import',
      value: { enabled: true, revision: 1 },
    });
  }
  return settings;
}

async function seedSponsor(db: AdminDb, fixture: Fixture) {
  const { tenantId, branchId, planKey, leadId, sponsorId, creatorId, staffId, operatorId } =
    fixture;
  const [entity] = await db
    .select({ id: legalEntities.id })
    .from(legalEntities)
    .where(and(eq(legalEntities.tenantId, tenantId), eq(legalEntities.isActive, true)))
    .orderBy(asc(legalEntities.id))
    .limit(1);
  if (!entity) throw new Error(`The contract requires a seeded legal entity for ${tenantId}.`);
  const now = new Date();
  await db.transaction(async tx => {
    await tx.insert(branches).values({ id: branchId, tenantId, slug: branchId, name: 'Fixture' });
    await tx.insert(user).values(
      [
        { id: creatorId, role: 'agent' as const },
        { id: staffId, role: 'staff' as const },
        { id: operatorId, role: 'super_admin' as const },
      ].map(actor => ({
        ...actor,
        tenantId,
        branchId,
        email: `${actor.id}@example.test`,
        name: 'Pilot sponsor fixture',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      }))
    );
    await tx.insert(membershipPlans).values({
      id: planKey,
      tenantId,
      tier: 'standard',
      name: 'Fixture',
      price: '20.00',
      updatedAt: now,
    });
    await tx.insert(memberLeads).values({
      id: leadId,
      tenantId,
      branchId,
      agentId: creatorId,
      firstName: 'Fixture',
      lastName: 'Contact',
      email: `${leadId}@example.test`,
      phone: '+38349000000',
      leadKind: 'company',
      companyName: 'Fixture company',
      consentNoticeVersion: 'pre-consent-legacy',
      captureChannel: 'legacy',
    });
    await tx.insert(sponsors).values({
      id: sponsorId,
      tenantId,
      branchId,
      sourceLeadId: leadId,
      createdBy: creatorId,
      legalName: 'Fixture company',
      billingContactName: 'Fixture contact',
      billingContactEmail: `${leadId}@example.test`,
    });
    await tx.insert(sponsorTerms).values(
      fixture.terms.map(term => ({
        id: term.id,
        tenantId,
        sponsorId,
        termStart: term.start,
        termEnd: term.end,
        legalEntityId: entity.id,
        planKey,
        planId: 'standard',
        createdBy: creatorId,
      }))
    );
    await tx.insert(sponsorTermRevisions).values(
      fixture.terms.map(term => ({
        id: term.revisionId,
        tenantId,
        termId: term.id,
        revision: 1,
        seatCount: 4,
        pricePerSeatMinor: 2000,
        currency: 'EUR',
        contractReference: 'Fixture contract',
        termsVersion: 'fixture-v1',
        createdBy: creatorId,
      }))
    );
    if (fixture.entries.length > 0) {
      const term = fixture.terms[0];
      await tx.insert(sponsorRevisionDecisions).values({
        id: `${term.revisionId}-admitted`,
        tenantId,
        revisionId: term.revisionId,
        decision: 'approved',
        decidedBy: staffId,
        invoiceReference: 'Fixture invoice',
      });
      await tx.insert(sponsorRosterEntries).values(
        fixture.entries.map(entry => ({
          id: entry.id,
          tenantId,
          termId: term.id,
          firstName: 'Fixture',
          lastName: 'Member',
          emailNormalized: entry.email,
          emailHmac: entry.id,
          addedBy: creatorId,
        }))
      );
    }
  });
}

async function removeSponsor(db: AdminDb, fixture: Fixture) {
  const entryIds = fixture.entries.map(entry => entry.id);
  const revisionIds = fixture.terms.map(term => term.revisionId);
  const actorIds = [fixture.staffId, fixture.creatorId, fixture.operatorId];
  await db.transaction(async tx => {
    const members = tx
      .select({ id: user.id })
      .from(user)
      .where(
        inArray(
          user.email,
          fixture.entries.map(entry => entry.email)
        )
      );
    await tx
      .delete(auditLog)
      .where(
        or(
          inArray(auditLog.entityId, [...entryIds, ...revisionIds]),
          inArray(auditLog.actorId, actorIds)
        )
      );
    await tx.delete(sponsorMailOutbox).where(inArray(sponsorMailOutbox.rosterEntryId, entryIds));
    await tx.delete(sponsorRosterEntries).where(inArray(sponsorRosterEntries.id, entryIds));
    await tx.delete(subscriptions).where(inArray(subscriptions.userId, members));
    await tx.delete(user).where(inArray(user.id, members));
    await tx
      .delete(sponsorRevisionDecisions)
      .where(inArray(sponsorRevisionDecisions.revisionId, revisionIds));
    await tx.delete(sponsorTermRevisions).where(inArray(sponsorTermRevisions.id, revisionIds));
    await tx.delete(sponsorTerms).where(
      inArray(
        sponsorTerms.id,
        fixture.terms.map(term => term.id)
      )
    );
    await tx.delete(sponsors).where(eq(sponsors.id, fixture.sponsorId));
    await tx.delete(memberLeads).where(eq(memberLeads.id, fixture.leadId));
    await tx.delete(user).where(inArray(user.id, actorIds));
    await tx.delete(membershipPlans).where(eq(membershipPlans.id, fixture.planKey));
    await tx.delete(branches).where(eq(branches.id, fixture.branchId));
  });
}

export async function withSponsors(db: AdminDb, fixtures: Fixture[], run: () => Promise<void>) {
  const settings = fixtures.flatMap(fixtureSettings);
  const touchedSettings = or(
    ...settings.map(setting =>
      and(
        eq(tenantSettings.tenantId, setting.tenantId),
        eq(tenantSettings.category, setting.category),
        eq(tenantSettings.key, setting.key)
      )
    )
  );
  const previous = await db.select().from(tenantSettings).where(touchedSettings);
  try {
    await db.transaction(async tx => {
      await tx.delete(tenantSettings).where(touchedSettings);
      await tx.insert(tenantSettings).values(settings);
    });
    for (const fixture of fixtures) await seedSponsor(db, fixture);
    await run();
  } finally {
    try {
      for (const fixture of fixtures) await removeSponsor(db, fixture);
    } finally {
      await db.transaction(async tx => {
        await tx.delete(tenantSettings).where(touchedSettings);
        if (previous.length > 0) await tx.insert(tenantSettings).values(previous);
      });
    }
  }
}
