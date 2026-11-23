import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, inArray } from 'drizzle-orm';

import { agentClients, memberActivities, user } from '../src/schema';
import {
  assertRestrictedPosture,
  byText,
  type Cleanups,
  grantTablePrivileges,
  ksActor,
  openActivitySession,
  withCleanup,
} from './activity-access-rls.support';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06: the member's referring agent (user.agentId) is no admission to its activities, proven by
// the domain commands on a real database, connected as the restricted role. Only an active
// agent_clients row admits an agent. A referral-only member is refused to its referring agent;
// after a member's assignment moves from agent A to agent B, agent A is refused for reads and
// writes while agent B is admitted, though the member still names agent A.
test('the referring agent is refused member activities without an active assignment', async t => {
  const session = await openActivitySession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  const ids = {
    agentA: fixture.newId('member_move_agent_a'),
    agentB: fixture.newId('member_move_agent_b'),
    moved: fixture.newId('member_move_member_moved'),
    referred: fixture.newId('member_move_member_referred'),
  };
  const members = [ids.moved, ids.referred];
  const userIds = [ids.agentA, ids.agentB, ...members];
  let revoke: (() => Promise<void>) | null = null;
  // Registered before the first write, so a failure part-way through seeding still cleans up.
  const cleanups: Cleanups = [
    () => adminDb.delete(memberActivities).where(inArray(memberActivities.memberId, members)),
    () => adminDb.delete(agentClients).where(inArray(agentClients.memberId, members)),
    () => adminDb.delete(user).where(inArray(user.id, userIds)),
    async () => revoke?.(),
    () => session.close(),
  ];

  await withCleanup(
    t,
    async () => {
      revoke = await grantTablePrivileges(adminDb, [
        ['select, update', 'user'],
        ['select, update', 'agent_clients'],
        ['select, insert', 'member_activities'],
      ]);
      const now = new Date();
      const person = (id: string, role: string, agentId: string | null = null) => ({
        id,
        tenantId: KS_TENANT_ID,
        role,
        agentId,
        name: `Member move ${id}`,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      // Both members name agent A as their referring agent. Only `moved` has an agent_clients
      // row, active for agent A until the move below.
      await adminDb
        .insert(user)
        .values([
          person(ids.agentA, 'agent'),
          person(ids.agentB, 'agent'),
          person(ids.moved, 'member', ids.agentA),
          person(ids.referred, 'member', ids.agentA),
        ]);
      await adminDb.insert(agentClients).values({
        id: fixture.newId('member_move_client_a'),
        tenantId: KS_TENANT_ID,
        agentId: ids.agentA,
        memberId: ids.moved,
        status: 'active',
      });
      await adminDb.insert(memberActivities).values(
        members.map(memberId => ({
          id: fixture.newId('member_move_activity'),
          tenantId: KS_TENANT_ID,
          agentId: ids.agentA,
          memberId,
          type: 'call',
          subject: `Activity of ${memberId}`,
          occurredAt: now,
          createdAt: now,
          updatedAt: now,
        }))
      );
      const storedRows = async () =>
        (
          await adminDb
            .select({
              id: memberActivities.id,
              memberId: memberActivities.memberId,
              agentId: memberActivities.agentId,
            })
            .from(memberActivities)
            .where(inArray(memberActivities.memberId, members))
        ).sort((left, right) => left.id.localeCompare(right.id));
      const idsOf = (rows: Array<{ id: string; memberId: string }>, memberId: string) =>
        rows
          .filter(row => row.memberId === memberId)
          .map(row => row.id)
          .sort(byText);

      await assertRestrictedPosture(ksActor(ids.agentA, 'agent').authority, [
        'user',
        'agent_clients',
        'member_activities',
      ]);
      const [{ getMemberActivitiesCore }, { logActivityCore }] = await Promise.all([
        import('../../domain-activities/src/get-member'),
        import('../../domain-activities/src/log-member'),
      ]);
      const agentA = ksActor(ids.agentA, 'agent');
      const agentB = ksActor(ids.agentB, 'agent');
      type Actor = typeof agentA;
      const readIds = async (actor: Actor, memberId: string) =>
        (await getMemberActivitiesCore({ ...actor, memberId })).map(row => row.id).sort(byText);
      const refused = (actor: Actor, memberId: string) =>
        assert.rejects(
          getMemberActivitiesCore({ ...actor, memberId }),
          { message: 'Permission denied' },
          memberId
        );
      const log = (actor: Actor, memberId: string) =>
        logActivityCore({ ...actor, data: { memberId, type: 'note', subject: 'RLS proof' } });
      const denied = { success: false, error: 'Member access denied' };

      // Before the move, agent A's active row admits it to `moved`.
      const seeded = await storedRows();
      assert.deepEqual(await readIds(agentA, ids.moved), idsOf(seeded, ids.moved));

      // A referral-only member: agent A is refused for reads and writes.
      await refused(agentA, ids.referred);
      assert.deepEqual(await log(agentA, ids.referred), denied);
      assert.deepEqual(await storedRows(), seeded, 'nothing was written');

      // The move, as the app revokes an assignment (every row of the member set inactive), then
      // the grant to agent B. `moved` still names agent A as its referring agent.
      await adminDb
        .update(agentClients)
        .set({ status: 'inactive' })
        .where(and(eq(agentClients.tenantId, KS_TENANT_ID), eq(agentClients.memberId, ids.moved)));
      await adminDb.insert(agentClients).values({
        id: fixture.newId('member_move_client_b'),
        tenantId: KS_TENANT_ID,
        agentId: ids.agentB,
        memberId: ids.moved,
        status: 'active',
      });
      const [referrer] = await adminDb
        .select({ agentId: user.agentId })
        .from(user)
        .where(eq(user.id, ids.moved));
      assert.equal(referrer?.agentId, ids.agentA, 'the member still names agent A');

      // After the move, agent A is refused for reads and writes; agent B is admitted.
      await refused(agentA, ids.moved);
      assert.deepEqual(await log(agentA, ids.moved), denied);
      assert.deepEqual(await storedRows(), seeded, 'the former agent wrote nothing');
      assert.deepEqual(await readIds(agentB, ids.moved), idsOf(seeded, ids.moved));
      assert.deepEqual(await log(agentB, ids.moved), { success: true, error: undefined });
      const added = (await storedRows()).filter(row => !seeded.some(old => old.id === row.id));
      assert.deepEqual(
        added.map(({ memberId, agentId }) => ({ memberId, agentId })),
        [{ memberId: ids.moved, agentId: ids.agentB }]
      );
    },
    () => cleanups
  );
});
