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

// R-06: the member-lead list visibility (an agent its own leads, a branch manager its branch, the
// tenant and super admins the tenant, every other role nothing) proven by the domain query on a
// real database, connected as the restricted role.
const sorted = (...values: string[]) => [...values].sort(byText);

test('the restricted role lists member leads only within the principal visibility', async t => {
  const session = await openActivitySession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  // Every query searches this token, so leads seeded by other tests never enter the comparison.
  const token = fixture.newId('mlrls').toLowerCase();
  const ids = {
    branch1: fixture.newId('mlrls_branch_1'),
    branch2: fixture.newId('mlrls_branch_2'),
    branchMk: fixture.newId('mlrls_branch_mk'),
    agentA: fixture.newId('mlrls_agent_a'),
    agentB: fixture.newId('mlrls_agent_b'),
    agentMk: fixture.newId('mlrls_agent_mk'),
    leadA: fixture.newId('mlrls_lead_a'),
    leadB: fixture.newId('mlrls_lead_b'),
    leadMk: fixture.newId('mlrls_lead_mk'),
  };
  const branchIds = [ids.branch1, ids.branch2, ids.branchMk];
  const userIds = [ids.agentA, ids.agentB, ids.agentMk];
  const leadIds = [ids.leadA, ids.leadB, ids.leadMk];
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
        ['select', 'lead_payment_attempts'],
      ]);
      const now = new Date();
      await adminDb.insert(branches).values(
        [
          [ids.branch1, KS_TENANT_ID],
          [ids.branch2, KS_TENANT_ID],
          [ids.branchMk, MK_TENANT_ID],
        ].map(([id, tenantId]) => ({ id, tenantId, name: id, slug: id }))
      );
      await adminDb.insert(user).values(
        [
          [ids.agentA, KS_TENANT_ID, ids.branch1],
          [ids.agentB, KS_TENANT_ID, ids.branch2],
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
          [ids.leadB, KS_TENANT_ID, ids.branch2, ids.agentB],
          [ids.leadMk, MK_TENANT_ID, ids.branchMk, ids.agentMk],
        ].map(([id, tenantId, branchId, agentId]) => ({
          id,
          tenantId,
          branchId,
          agentId,
          firstName: 'Lead',
          lastName: id,
          email: `${token}-${id}@example.test`.toLowerCase(),
          phone: '+38344000000',
          // Agent-assisted consent, as the agent portal captures it: the table's checks need a
          // capture time and agent, and its trigger keeps legacy consent for backfilled rows only.
          consentNoticeVersion: 'lead-notice-v1',
          captureChannel: 'agent_assisted' as const,
          consentCapturedAt: now,
          consentCapturedBy: agentId,
          createdAt: now,
          updatedAt: now,
        }))
      );

      await assertRestrictedPosture(ksActor(ids.agentA, 'agent').authority, [
        'member_leads',
        'lead_payment_attempts',
      ]);
      const { listVisibleMemberLeads } = await import('../../domain-leads/src/list');
      type Actor = ReturnType<typeof ksActor>;
      const list = (actor: Actor, input: Record<string, unknown> = {}) =>
        listVisibleMemberLeads(actor.session.user, actor.authority, { search: token, ...input });
      const listed = async (actor: Actor, input: Record<string, unknown> = {}) => {
        const result = await list(actor, input);
        assert.ok(result.ok, `expected rows, got ${JSON.stringify(result)}`);
        return result.leads.map(lead => lead.id).sort(byText);
      };

      // The MK lead exists under MK's own authority: its absence below is the tenant rule.
      assert.deepEqual(await listed(actorIn(MK_TENANT_ID, ids.agentMk, 'agent')), [ids.leadMk]);

      // An agent sees only its own leads, whatever branch the input names.
      assert.deepEqual(await listed(ksActor(ids.agentA, 'agent')), [ids.leadA]);
      assert.deepEqual(await listed(ksActor(ids.agentA, 'agent'), { branchId: ids.branch2 }), [
        ids.leadA,
      ]);
      // A branch manager sees its branch, and a branch named in the input cannot widen it.
      const manager = ksActor('mlrls-manager', 'branch_manager', ids.branch1);
      assert.deepEqual(await listed(manager), [ids.leadA]);
      assert.deepEqual(await listed(manager, { branchId: ids.branch2 }), [ids.leadA]);
      // The tenant admins see the tenant, narrowed by an optional branch, never another tenant.
      for (const role of ['admin', 'tenant_admin', 'super_admin']) {
        const admin = ksActor(`mlrls-${role}`, role);
        assert.deepEqual(await listed(admin), sorted(ids.leadA, ids.leadB), role);
        assert.deepEqual(await listed(admin, { branchId: ids.branch2 }), [ids.leadB], role);
        assert.deepEqual(await listed(admin, { branchId: ids.branchMk }), [], role);
      }

      // Refused before any read.
      assert.deepEqual(await list(ksActor('mlrls-manager', 'branch_manager')), {
        ok: false,
        code: 'FORBIDDEN_NO_BRANCH',
      });
      for (const role of ['member', 'user', 'staff', 'promoter', 'auditor', 'global_support']) {
        assert.deepEqual(
          await list(ksActor(`mlrls-${role}`, role)),
          { ok: false, code: 'FORBIDDEN' },
          role
        );
      }
      // An authority minted for another agent than the session is refused, never read under,
      // although agent B's own authority lists lead B.
      assert.deepEqual(await listed(ksActor(ids.agentB, 'agent')), [ids.leadB]);
      assert.deepEqual(
        await listVisibleMemberLeads(
          ksActor(ids.agentA, 'agent').session.user,
          ksActor(ids.agentB, 'agent').authority,
          { search: token }
        ),
        { ok: false, code: 'FORBIDDEN' }
      );
      assert.deepEqual(await list(ksActor(ids.agentA, 'agent'), { tenantId: MK_TENANT_ID }), {
        ok: false,
        code: 'VALIDATION_ERROR',
      });
    },
    () => cleanups
  );
});
