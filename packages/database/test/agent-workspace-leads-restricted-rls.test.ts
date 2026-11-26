import assert from 'node:assert/strict';
import test from 'node:test';

import { inArray } from 'drizzle-orm';

import { branches, memberLeads, user } from '../src/schema';
import {
  byText,
  assertRestrictedPosture,
  type Cleanups,
  grantTablePrivileges,
  ksActor,
  openActivitySession,
  withCleanup,
} from './activity-access-rls.support';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06, R-37 reproduction: the agent workspace leads read (`/agent/workspace/leads`), run as the
// page runs it (the session's authority, one tenant transaction, the restricted role), must show
// an agent only its own leads, as `packages/domain-leads/MODULE.md` states. Agent B's lead in the
// same tenant and branch must not appear for agent A.
test('the agent workspace leads read shows an agent only its own leads', async t => {
  const session = await openActivitySession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  const ids = {
    branch: fixture.newId('awlrls_branch'),
    agentA: fixture.newId('awlrls_agent_a'),
    agentB: fixture.newId('awlrls_agent_b'),
    leadA: fixture.newId('awlrls_lead_a'),
    leadB: fixture.newId('awlrls_lead_b'),
  };
  const userIds = [ids.agentA, ids.agentB];
  const leadIds = [ids.leadA, ids.leadB];
  let revoke: (() => Promise<void>) | null = null;
  const cleanups: Cleanups = [
    () => adminDb.delete(memberLeads).where(inArray(memberLeads.id, leadIds)),
    () => adminDb.delete(user).where(inArray(user.id, userIds)),
    () => adminDb.delete(branches).where(inArray(branches.id, [ids.branch])),
    async () => revoke?.(),
    () => session.close(),
  ];

  await withCleanup(
    t,
    async () => {
      revoke = await grantTablePrivileges(adminDb, [
        ['select', 'member_leads'],
        ['select', 'branches'],
      ]);
      const now = new Date();
      await adminDb
        .insert(branches)
        .values({ id: ids.branch, tenantId: KS_TENANT_ID, name: ids.branch, slug: ids.branch });
      await adminDb.insert(user).values(
        userIds.map(id => ({
          id,
          tenantId: KS_TENANT_ID,
          branchId: ids.branch,
          role: 'agent',
          name: id,
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        }))
      );
      await adminDb.insert(memberLeads).values(
        [
          [ids.leadA, ids.agentA],
          [ids.leadB, ids.agentB],
        ].map(([id, agentId]) => ({
          id,
          tenantId: KS_TENANT_ID,
          branchId: ids.branch,
          agentId,
          firstName: 'Lead',
          lastName: id,
          email: `${id}@example.test`.toLowerCase(),
          phone: '+38344000000',
          consentNoticeVersion: 'lead-notice-v1',
          captureChannel: 'agent_assisted' as const,
          consentCapturedAt: now,
          consentCapturedBy: agentId,
          createdAt: now,
          updatedAt: now,
        }))
      );

      const agentA = ksActor(ids.agentA, 'agent', ids.branch);
      await assertRestrictedPosture(agentA.authority, ['member_leads', 'branches']);
      // Imported after the session opened: the tenant client must connect as the restricted role.
      const { withTenantAuthority } = await import('../src/tenant-authority-context');
      const { getAgentWorkspaceLeadsCore } =
        await import('../../../apps/web/src/app/[locale]/(agent)/agent/workspace/leads/_core');
      const result = await withTenantAuthority(agentA.authority, tx =>
        getAgentWorkspaceLeadsCore({ tenantId: KS_TENANT_ID, db: tx })
      );
      // Other tests' leads may exist in the tenant; compare only the leads seeded here.
      const seeded = result.leads
        .map(lead => lead.id)
        .filter(id => leadIds.includes(id))
        .sort(byText);
      assert.deepEqual(seeded, [ids.leadA], 'agent A must not see agent B lead');
    },
    () => cleanups
  );
});
