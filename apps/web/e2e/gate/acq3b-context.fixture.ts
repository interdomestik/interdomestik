import { randomUUID } from 'node:crypto';
import {
  account,
  agentSettings,
  E2E_USERS,
  eq,
  memberLeads,
  sql,
  tenantSettings,
  user,
} from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { ROLES } from '@interdomestik/shared-auth';
import { SPONSORED_IMPORT_SETTING } from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';
import { cleanupSponsorFixture } from './acq3b-cleanup.fixture';

export const rosterSecret =
  process.env.SPONSOR_ROSTER_SECRET ?? 'e2e-sponsor-roster-secret-not-for-production-01';
export type Person = { id: string; email: string; name: string };
export type SponsorFixture = {
  prefix: string;
  tenantId: string;
  authority: TenantAuthority;
  foreignAuthority: TenantAuthority;
  branchId: string;
  agent: Person;
  staff: Person;
  member: Person;
  paying: Person;
  other: Person;
  foreign: Person;
  newEmail: string;
  leadId: string;
  leadIds: string[];
  planKey: string;
  planId: string;
  entityId: string;
  entityName: string;
  now: Date;
  start: Date;
  end: Date;
  paidEnd: Date;
};

// Same lock as group-access-privacy-consent.fixture.ts: it spans snapshot through restore.
// SELECT avoids tx.execute; fixture writes commit separately so the app can see them.
export async function withSponsorFixture(run: (f: SponsorFixture) => Promise<void>): Promise<void> {
  const authority = mintTestTenantAuthority(E2E_USERS.KS_AGENT.tenantId);
  await withTenantAuthority(authority, async tx => {
    await tx.select({ held: sql`pg_advisory_xact_lock(hashtext('e2e-group-access-privacy:ks'))` });
    await runLockedFixture(authority, run);
  });
}

async function runLockedFixture(
  authority: TenantAuthority,
  run: (f: SponsorFixture) => Promise<void>
): Promise<void> {
  const tenantId = E2E_USERS.KS_AGENT.tenantId;
  const seed = await withTenantAuthority(authority, async tx => ({
    agent: await tx.query.user.findFirst({ where: eq(user.email, E2E_USERS.KS_AGENT.email) }),
    plan: await tx.query.membershipPlans.findFirst({
      where: (p, { and, eq }) => and(eq(p.tenantId, tenantId), eq(p.isActive, true)),
    }),
    entity: await tx.query.legalEntities.findFirst({
      where: (e, { and, eq }) => and(eq(e.tenantId, tenantId), eq(e.isActive, true)),
    }),
    setting: await tx.query.tenantSettings.findFirst({
      where: (s, { and, eq }) =>
        and(
          eq(s.tenantId, tenantId),
          eq(s.category, SPONSORED_IMPORT_SETTING.category),
          eq(s.key, SPONSORED_IMPORT_SETTING.key)
        ),
    }),
  }));
  if (!seed.agent?.branchId || !seed.plan || !seed.entity) throw new Error('Missing KS E2E seed');
  const credential = await withTenantAuthority(authority, tx =>
    tx.query.account.findFirst({
      where: (a, { and, eq }) =>
        and(eq(a.userId, seed.agent?.id ?? ''), eq(a.providerId, 'credential')),
    })
  );
  if (!credential?.password) throw new Error('Missing E2E credential');
  const prefix = `acq3b-${randomUUID()}`;
  const person = (name: string): Person => ({
    id: `${prefix}-${name}`,
    email: `${prefix}-${name.toLowerCase()}@example.com`,
    name,
  });
  const now = new Date();
  const day = 86_400_000;
  const f: SponsorFixture = {
    prefix,
    tenantId,
    authority,
    foreignAuthority: mintTestTenantAuthority(E2E_USERS.MK_MEMBER.tenantId),
    branchId: seed.agent.branchId,
    agent: person('Office'),
    staff: person('Staff'),
    member: person('Existing'),
    paying: person('Paying'),
    other: person('Other'),
    foreign: person('Foreign'),
    newEmail: `${prefix}-new@example.com`,
    leadId: `${prefix}-lead`,
    leadIds: [`${prefix}-lead`],
    planKey: seed.plan.id,
    planId: seed.plan.tier,
    entityId: seed.entity.id,
    entityName: seed.entity.legalName,
    now,
    start: new Date(now.getTime() - day),
    end: new Date(now.getTime() + 364 * day),
    paidEnd: new Date(now.getTime() + 30 * day),
  };
  try {
    await seedPeople(f, credential.password);
    await withTenantAuthority(authority, async tx => {
      await tx
        .insert(agentSettings)
        .values({ id: `${prefix}-settings`, tenantId, agentId: f.agent.id, tier: 'office' });
      // Same consent provenance as insertOwnedMemberLead; all IDs and users belong to this run.
      await tx.insert(memberLeads).values({
        id: f.leadId,
        tenantId,
        branchId: f.branchId,
        agentId: f.agent.id,
        leadKind: 'company',
        companyName: prefix,
        firstName: 'E2E',
        lastName: 'Company',
        email: `${prefix}-company@example.com`,
        phone: '+38344123456',
        status: 'new',
        consentNoticeVersion: 'e2e-agent-notice-v1',
        consentCapturedAt: now,
        consentCapturedBy: f.agent.id,
        captureChannel: 'agent_assisted',
      });
      await tx
        .insert(tenantSettings)
        .values({
          id: `${prefix}-import`,
          tenantId,
          ...SPONSORED_IMPORT_SETTING,
          value: { enabled: true },
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.category, tenantSettings.key],
          set: { value: { enabled: true } },
        });
    });
    await run(f);
  } finally {
    try {
      await cleanupSponsorFixture(f);
    } finally {
      await withTenantAuthority(authority, async tx => {
        if (seed.setting) {
          await tx
            .update(tenantSettings)
            .set({ value: seed.setting.value, updatedAt: seed.setting.updatedAt })
            .where(eq(tenantSettings.id, seed.setting.id));
        } else {
          await tx.delete(tenantSettings).where(eq(tenantSettings.id, `${prefix}-import`));
        }
      });
    }
  }
}

async function seedPeople(f: SponsorFixture, password: string): Promise<void> {
  await withTenantAuthority(f.authority, async tx => {
    await tx.insert(user).values(
      [f.agent, f.staff, f.member, f.paying, f.other].map(p => ({
        ...p,
        tenantId: f.tenantId,
        branchId: f.branchId,
        emailVerified: true,
        role: fixtureRole(p.id, f),
        createdAt: f.now,
        updatedAt: f.now,
      }))
    );
    await tx.insert(account).values(
      [f.agent, f.staff, f.member, f.paying, f.other].map(p => ({
        id: `${p.id}-credential`,
        accountId: p.id,
        userId: p.id,
        providerId: 'credential',
        password,
        createdAt: f.now,
        updatedAt: f.now,
      }))
    );
  });
  await withTenantAuthority(f.foreignAuthority, tx =>
    tx.insert(user).values({
      ...f.foreign,
      tenantId: E2E_USERS.MK_MEMBER.tenantId,
      role: ROLES.member,
      emailVerified: true,
      createdAt: f.now,
      updatedAt: f.now,
    })
  );
}

function fixtureRole(id: string, fixture: SponsorFixture): string {
  if (id === fixture.agent.id) return ROLES.agent;
  return id === fixture.staff.id ? ROLES.staff : ROLES.member;
}
