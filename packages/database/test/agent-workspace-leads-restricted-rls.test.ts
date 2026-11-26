import assert from 'node:assert/strict';
import test from 'node:test';

import { inArray } from 'drizzle-orm';

import { branches, memberLeads, user } from '../src/schema';
import {
  byText,
  actorIn,
  assertRestrictedPosture,
  type Cleanups,
  grantTablePrivileges,
  ksActor,
  openActivitySession,
  withCleanup,
} from './activity-access-rls.support';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06, R-37 regression: `/agent/leads` and `/agent/workspace/leads` read through one query
// (`getAgentLeadsCore`), run as the pages run it: the session's authority, one tenant transaction,
// the restricted role. An agent sees only its own leads in its branch (the workspace page used to
// read the whole tenant). Each denied lead is real: its owner, or the tenant it belongs to, reads it.
test('the agent leads read shows an agent only its own leads in its branch', async t => {
  const session = await openActivitySession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  const ids = {
    branch1: fixture.newId('awlrls_branch_1'),
    branch2: fixture.newId('awlrls_branch_2'),
    branchMk: fixture.newId('awlrls_branch_mk'),
    agentA: fixture.newId('awlrls_agent_a'),
    agentB: fixture.newId('awlrls_agent_b'),
    agentMk: fixture.newId('awlrls_agent_mk'),
    leadA: fixture.newId('awlrls_lead_a'),
    leadA2: fixture.newId('awlrls_lead_a_branch_2'),
    leadB: fixture.newId('awlrls_lead_b'),
    leadMk: fixture.newId('awlrls_lead_mk'),
  };
  const branchIds = [ids.branch1, ids.branch2, ids.branchMk];
  const userIds = [ids.agentA, ids.agentB, ids.agentMk];
  const leadIds = [ids.leadA, ids.leadA2, ids.leadB, ids.leadMk];
  let revoke: (() => Promise<void>) | null = null;
  // Registered before the first write, so a failure part-way through seeding still cleans up.
  const cleanups: Cleanups = [
    () => adminDb.delete(memberLeads).where(inArray(memberLeads.id, leadIds)),
    () => adminDb.delete(user).where(inArray(user.id, userIds)),
    () => adminDb.delete(branches).where(inArray(branches.id, branchIds)),
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
      await adminDb.insert(branches).values(
        [
          [ids.branch1, KS_TENANT_ID],
          [ids.branch2, KS_TENANT_ID],
          [ids.branchMk, MK_TENANT_ID],
        ].map(([id, tenantId]) => ({ id, tenantId, name: `name-${id}`, slug: id }))
      );
      await adminDb.insert(user).values(
        [
          [ids.agentA, KS_TENANT_ID, ids.branch1],
          [ids.agentB, KS_TENANT_ID, ids.branch1],
          [ids.agentMk, MK_TENANT_ID, ids.branchMk],
        ].map(([id, tenantId, branchId]) => ({
          id,
          tenantId,
          branchId,
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
          [ids.leadA, KS_TENANT_ID, ids.branch1, ids.agentA],
          [ids.leadA2, KS_TENANT_ID, ids.branch2, ids.agentA],
          [ids.leadB, KS_TENANT_ID, ids.branch1, ids.agentB],
          [ids.leadMk, MK_TENANT_ID, ids.branchMk, ids.agentMk],
        ].map(([id, tenantId, branchId, agentId]) => ({
          id,
          tenantId,
          branchId,
          agentId,
          firstName: 'Lead',
          lastName: id,
          email: `${id}@example.test`.toLowerCase(),
          phone: '+38344000000',
          // Agent-assisted consent, as the agent portal captures it (the table's checks need it).
          consentNoticeVersion: 'lead-notice-v1',
          captureChannel: 'agent_assisted' as const,
          consentCapturedAt: now,
          consentCapturedBy: agentId,
          createdAt: now,
          updatedAt: now,
        }))
      );

      const agentA = ksActor(ids.agentA, 'agent', ids.branch1);
      const agentB = ksActor(ids.agentB, 'agent', ids.branch1);
      const agentMk = actorIn(MK_TENANT_ID, ids.agentMk, 'agent', ids.branchMk);
      await assertRestrictedPosture(agentA.authority, ['member_leads', 'branches']);
      // Imported after the session opened: the tenant client must connect as the restricted role.
      const { withTenantAuthority } = await import('../src/tenant-authority-context');
      const { getAgentLeadsCore } =
        await import('../../../apps/web/src/app/[locale]/(agent)/agent/leads/_core');
      type Actor = typeof agentA;
      type Scope = { tenantId: string; agentId: string; branchId: string };
      const read = (actor: Actor, scope: Scope) =>
        withTenantAuthority(actor.authority, tx => getAgentLeadsCore(scope, { db: tx }));
      // Other tests' leads may exist in these tenants; compare only the leads seeded here.
      const seeded = async (actor: Actor, scope: Scope) =>
        (await read(actor, scope))
          .map(lead => lead.id)
          .filter(id => leadIds.includes(id))
          .sort(byText);

      // Own leads: agent A in branch 1 sees exactly its branch-1 lead. Agent B's lead (same tenant
      // and branch) and agent A's own branch-2 lead are absent.
      const scopeA = { tenantId: KS_TENANT_ID, agentId: ids.agentA, branchId: ids.branch1 };
      assert.deepEqual(await seeded(agentA, scopeA), [ids.leadA], 'agent A, own branch');
      // Only the branch name reaches the client.
      const [ownLead] = (await read(agentA, scopeA)).filter(lead => lead.id === ids.leadA);
      assert.deepEqual(ownLead?.branch, { name: `name-${ids.branch1}` });

      // The denied leads are real: agent B reads its own lead, agent A its branch-2 lead.
      const scopeB = { tenantId: KS_TENANT_ID, agentId: ids.agentB, branchId: ids.branch1 };
      assert.deepEqual(await seeded(agentB, scopeB), [ids.leadB], 'agent B, own branch');
      const agentAInBranch2 = ksActor(ids.agentA, 'agent', ids.branch2);
      assert.deepEqual(
        await seeded(agentAInBranch2, { ...scopeA, branchId: ids.branch2 }),
        [ids.leadA2],
        'agent A, branch 2'
      );

      // Wrong tenant, isolated: the MK arguments find the MK lead under MK's authority, and the
      // identical arguments under KS authority find nothing; only the tenant row policy differs.
      const scopeMk = { tenantId: MK_TENANT_ID, agentId: ids.agentMk, branchId: ids.branchMk };
      assert.deepEqual(await seeded(agentMk, scopeMk), [ids.leadMk], 'MK agent, MK authority');
      assert.deepEqual(await seeded(agentA, scopeMk), [], 'MK arguments under KS authority');
    },
    () => cleanups
  );
});
