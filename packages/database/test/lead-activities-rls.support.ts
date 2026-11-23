import type { TestContext } from 'node:test';

import { eq, inArray } from 'drizzle-orm';

import { crmActivities, crmLeads, user } from '../src/schema';
import {
  assertRestrictedPosture,
  type Cleanups,
  grantTablePrivileges,
  ksActor,
  openActivitySession,
  withCleanup,
} from './activity-access-rls.support';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  type S8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

/**
 * KS agents A and B and an MK agent, one lead each and one activity per lead, and a KS staff user
 * (an author without leads), for the R-06 proofs
 * of the lead-activity commands. The restricted role gets the privileges those commands use.
 */
export type Seeded = Awaited<ReturnType<typeof seedLeads>>;

export async function seedLeads(
  session: S8RestrictedSession,
  register: (cleanups: Cleanups) => void
) {
  const { adminDb, fixture } = session;
  const ids = {
    agentA: fixture.newId('lead_rls_agent_a'),
    agentB: fixture.newId('lead_rls_agent_b'),
    agentMk: fixture.newId('lead_rls_agent_mk'),
    staff: fixture.newId('lead_rls_staff'),
    leadA: fixture.newId('lead_rls_lead_a'),
    leadB: fixture.newId('lead_rls_lead_b'),
    leadMk: fixture.newId('lead_rls_lead_mk'),
    activityA: fixture.newId('lead_rls_activity_a'),
    activityB: fixture.newId('lead_rls_activity_b'),
    activityMk: fixture.newId('lead_rls_activity_mk'),
  };
  const userIds = [ids.agentA, ids.agentB, ids.agentMk, ids.staff];
  const leadIds = [ids.leadA, ids.leadB, ids.leadMk];
  // Registered before the first write, so a failure part-way through seeding still cleans up.
  let revoke: (() => Promise<void>) | null = null;
  register([
    () => adminDb.delete(crmActivities).where(inArray(crmActivities.leadId, leadIds)),
    () => adminDb.delete(crmLeads).where(inArray(crmLeads.id, leadIds)),
    () => adminDb.delete(user).where(inArray(user.id, userIds)),
    async () => revoke?.(),
    () => session.close(),
  ]);
  revoke = await grantTablePrivileges(adminDb, [
    ['select, update', 'crm_leads'],
    ['select, insert', 'crm_activities'],
    ['select', 'user'],
  ]);
  const now = new Date();
  await adminDb.insert(user).values(
    [
      [ids.agentA, KS_TENANT_ID, 'agent'],
      [ids.agentB, KS_TENANT_ID, 'agent'],
      [ids.agentMk, MK_TENANT_ID, 'agent'],
      [ids.staff, KS_TENANT_ID, 'staff'],
    ].map(([id, tenantId, role]) => ({
      id,
      tenantId,
      name: `Lead RLS ${id}`,
      email: `${id}@example.test`,
      emailVerified: true,
      role,
      createdAt: now,
      updatedAt: now,
    }))
  );
  await adminDb.insert(crmLeads).values(
    [
      [ids.leadA, KS_TENANT_ID, ids.agentA],
      [ids.leadB, KS_TENANT_ID, ids.agentB],
      [ids.leadMk, MK_TENANT_ID, ids.agentMk],
    ].map(([id, tenantId, agentId]) => ({
      id,
      tenantId,
      agentId,
      type: 'individual',
      fullName: `Lead ${id}`,
      stage: 'new',
    }))
  );
  await adminDb.insert(crmActivities).values(
    [
      [ids.activityA, KS_TENANT_ID, ids.leadA, ids.agentA],
      [ids.activityB, KS_TENANT_ID, ids.leadB, ids.agentB],
      [ids.activityMk, MK_TENANT_ID, ids.leadMk, ids.agentMk],
    ].map(([id, tenantId, leadId, agentId]) => ({
      id,
      tenantId,
      leadId,
      agentId,
      type: 'call',
      summary: `Activity ${id}`,
    }))
  );
  const activitiesOf = async (leadId: string) =>
    (
      await adminDb
        .select({
          id: crmActivities.id,
          tenantId: crmActivities.tenantId,
          agentId: crmActivities.agentId,
        })
        .from(crmActivities)
        .where(eq(crmActivities.leadId, leadId))
    ).sort((left, right) => left.id.localeCompare(right.id));
  return { ids, leadIds, activitiesOf };
}

export async function withLeads(
  t: TestContext,
  body: (session: S8RestrictedSession, seeded: Seeded) => Promise<void>,
  extraEnv: Record<string, string> = {}
): Promise<void> {
  const session = await openActivitySession(t, extraEnv);
  if (!session) return;
  let cleanups: Cleanups = [() => session.close()];
  await withCleanup(
    t,
    async () => {
      const seeded = await seedLeads(session, registered => {
        cleanups = registered;
      });
      await assertRestrictedPosture(ksActor(seeded.ids.agentA, 'agent').authority, [
        'crm_leads',
        'crm_activities',
      ]);
      await body(session, seeded);
    },
    () => cleanups
  );
}
