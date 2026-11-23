import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, inArray } from 'drizzle-orm';

import { agentClients, memberActivities, user } from '../src/schema';
import {
  actorIn,
  assertRestrictedPosture,
  type Cleanups,
  grantTablePrivileges,
  ksActor,
  openActivitySession,
  raceAgainstHeldWrite,
  withCleanup,
} from './activity-access-rls.support';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06: the member-activity rules proven by the domain commands on a real database, connected as
// the restricted role. Reads: a member its own, an agent the members of its active agent_clients
// rows only, staff and the tenant admins the tenant; branch managers and every other role nothing.
// The referring agent (user.agentId) is no admission: see
// member-activities-reassignment-restricted-rls.test.ts. Writes: the same minus the member's own,
// and an assignment revoked while a write waits refuses it (R-17).
test('the restricted role reads and logs member activities only within the actor scope', async t => {
  // Four app connections: the race below holds one command and probes it from another.
  const session = await openActivitySession(t, { DB_MAX_CONNECTIONS: '4' });
  if (!session) return;
  const { adminDb, fixture } = session;
  const ids = {
    agentA: fixture.newId('member_rls_agent_a'),
    agentC: fixture.newId('member_rls_agent_c'),
    agentMk: fixture.newId('member_rls_agent_mk'),
    staff: fixture.newId('member_rls_staff'),
    member1: fixture.newId('member_rls_member_1'),
    member2: fixture.newId('member_rls_member_2'),
    member3: fixture.newId('member_rls_member_3'),
    memberMk: fixture.newId('member_rls_member_mk'),
    client1: fixture.newId('member_rls_client_1'),
    client2: fixture.newId('member_rls_client_2'),
  };
  const members = [ids.member1, ids.member2, ids.member3, ids.memberMk];
  const userIds = [ids.agentA, ids.agentC, ids.agentMk, ids.staff, ...members];
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
      const person = (
        id: string,
        tenantId: string,
        role: string,
        agentId: string | null = null
      ) => ({
        id,
        tenantId,
        role,
        agentId,
        name: `Member RLS ${id}`,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await adminDb.insert(user).values([
        person(ids.agentA, KS_TENANT_ID, 'agent'),
        person(ids.agentC, KS_TENANT_ID, 'agent'),
        person(ids.agentMk, MK_TENANT_ID, 'agent'),
        person(ids.staff, KS_TENANT_ID, 'staff'),
        // member1 names agent A as its referring agent and has an active agent_clients row for
        // agent A; member2 and member3 reach agent C only through agent_clients, active for
        // member2 and inactive for member3. The MK member has an active row for the MK agent.
        person(ids.member1, KS_TENANT_ID, 'member', ids.agentA),
        person(ids.member2, KS_TENANT_ID, 'user'),
        person(ids.member3, KS_TENANT_ID, 'member'),
        person(ids.memberMk, MK_TENANT_ID, 'member', ids.agentMk),
      ]);
      await adminDb.insert(agentClients).values([
        {
          id: ids.client1,
          tenantId: KS_TENANT_ID,
          agentId: ids.agentA,
          memberId: ids.member1,
          status: 'active',
        },
        {
          id: ids.client2,
          tenantId: KS_TENANT_ID,
          agentId: ids.agentC,
          memberId: ids.member2,
          status: 'active',
        },
        {
          id: fixture.newId('member_rls_client_mk'),
          tenantId: MK_TENANT_ID,
          agentId: ids.agentMk,
          memberId: ids.memberMk,
          status: 'active',
        },
        {
          id: fixture.newId('member_rls_client_3'),
          tenantId: KS_TENANT_ID,
          agentId: ids.agentC,
          memberId: ids.member3,
          status: 'inactive',
        },
      ]);
      const activity = (memberId: string, tenantId: string, agentId: string) => ({
        id: fixture.newId('member_rls_activity'),
        tenantId,
        agentId,
        memberId,
        type: 'call',
        subject: `Activity of ${memberId}`,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const seededActivities = [
        activity(ids.member1, KS_TENANT_ID, ids.agentA),
        activity(ids.member2, KS_TENANT_ID, ids.agentC),
        activity(ids.member3, KS_TENANT_ID, ids.agentA),
        activity(ids.memberMk, MK_TENANT_ID, ids.agentMk),
      ];
      await adminDb.insert(memberActivities).values(seededActivities);
      const activityOf = (memberId: string) =>
        seededActivities.filter(row => row.memberId === memberId).map(row => row.id);
      const storedRows = async () =>
        (
          await adminDb
            .select({
              id: memberActivities.id,
              memberId: memberActivities.memberId,
              tenantId: memberActivities.tenantId,
              agentId: memberActivities.agentId,
            })
            .from(memberActivities)
            .where(inArray(memberActivities.memberId, members))
        ).sort((left, right) => left.id.localeCompare(right.id));

      await assertRestrictedPosture(ksActor(ids.agentA, 'agent').authority, [
        'user',
        'agent_clients',
        'member_activities',
      ]);
      const [{ getMemberActivitiesCore }, { logActivityCore }] = await Promise.all([
        import('../../domain-activities/src/get-member'),
        import('../../domain-activities/src/log-member'),
      ]);
      type Actor = ReturnType<typeof ksActor>;
      const read = (actor: Actor, memberId: string) =>
        getMemberActivitiesCore({ ...actor, memberId });
      const readIds = async (actor: Actor, memberId: string) =>
        (await read(actor, memberId)).map(row => row.id);
      const refused = (actor: Actor, memberId: string) =>
        assert.rejects(read(actor, memberId), { message: 'Permission denied' }, `${memberId}`);
      const log = (actor: Actor, data: Record<string, unknown>) =>
        logActivityCore({
          ...actor,
          data: { type: 'note', subject: 'RLS proof', ...data } as never,
        });

      // The MK member exists under MK's own authority: a refusal below is the rule's answer.
      assert.deepEqual(
        await readIds(actorIn(MK_TENANT_ID, ids.agentMk, 'agent'), ids.memberMk),
        activityOf(ids.memberMk)
      );

      // Reads allowed.
      assert.deepEqual(
        await readIds(ksActor(ids.member1, 'member'), ids.member1),
        activityOf(ids.member1)
      );
      assert.deepEqual(
        await readIds(ksActor(ids.member2, 'user'), ids.member2),
        activityOf(ids.member2)
      );
      assert.deepEqual(
        await readIds(ksActor(ids.agentA, 'agent'), ids.member1),
        activityOf(ids.member1)
      );
      assert.deepEqual(
        await readIds(ksActor(ids.agentC, 'agent'), ids.member2),
        activityOf(ids.member2)
      );
      for (const role of ['staff', 'tenant_admin', 'admin']) {
        assert.deepEqual(
          await readIds(ksActor(`${role}-reader`, role), ids.member3),
          activityOf(ids.member3),
          `${role} reads any member of the tenant`
        );
      }

      // Reads refused: another member, an unassigned agent, an inactive assignment, another
      // tenant, an unknown member, and roles outside the allow-list.
      await refused(ksActor(ids.member1, 'member'), ids.member2);
      await refused(ksActor(ids.agentA, 'agent'), ids.member2);
      await refused(ksActor(ids.agentC, 'agent'), ids.member3);
      await refused(ksActor('staff-reader', 'staff'), ids.memberMk);
      await refused(ksActor('staff-reader', 'staff'), `${ids.member1}_unknown`);
      for (const role of ['branch_manager', 'promoter', 'auditor', 'global_support']) {
        await refused(ksActor(`${role}-reader`, role), ids.member1);
      }

      // Writes refused, leaving every row unchanged.
      const before = await storedRows();
      for (const [actor, memberId, error] of [
        [ksActor(ids.member1, 'member'), ids.member1, 'Permission denied'],
        [ksActor(ids.member2, 'user'), ids.member2, 'Permission denied'],
        [ksActor('manager', 'branch_manager'), ids.member1, 'Permission denied'],
        [ksActor('auditor', 'auditor'), ids.member1, 'Permission denied'],
        [ksActor(ids.agentA, 'agent'), ids.member2, 'Member access denied'],
        [ksActor(ids.agentC, 'agent'), ids.member3, 'Member access denied'],
        [ksActor(ids.staff, 'staff'), ids.memberMk, 'Member access denied'],
        [ksActor(ids.staff, 'staff'), `${ids.member1}_unknown`, 'Member access denied'],
      ] as const) {
        assert.deepEqual(await log(actor, { memberId }), { success: false, error }, `${memberId}`);
      }
      assert.deepEqual(await storedRows(), before);

      // An input naming the tenant or the author is refused, not silently corrected.
      for (const injected of [{ tenantId: MK_TENANT_ID }, { agentId: ids.agentMk }]) {
        assert.deepEqual(
          await log(ksActor(ids.agentA, 'agent'), { memberId: ids.member1, ...injected }),
          { success: false, error: 'Validation failed' }
        );
      }
      assert.deepEqual(await storedRows(), before);

      // Writes allowed; the stored tenant and author come from the authority.
      for (const [actor, memberId] of [
        [ksActor(ids.agentA, 'agent'), ids.member1],
        [ksActor(ids.agentC, 'agent'), ids.member2],
        [ksActor(ids.staff, 'staff'), ids.member3],
      ] as const) {
        assert.deepEqual(
          await log(actor, { memberId }),
          { success: true, error: undefined },
          `${memberId}`
        );
      }
      const added = (await storedRows()).filter(row => !before.some(old => old.id === row.id));
      assert.deepEqual(
        added
          .map(({ memberId, tenantId, agentId }) => ({ memberId, tenantId, agentId }))
          .sort((left, right) => left.memberId.localeCompare(right.memberId)),
        [
          { memberId: ids.member1, tenantId: KS_TENANT_ID, agentId: ids.agentA },
          { memberId: ids.member2, tenantId: KS_TENANT_ID, agentId: ids.agentC },
          { memberId: ids.member3, tenantId: KS_TENANT_ID, agentId: ids.staff },
        ].sort((left, right) => left.memberId.localeCompare(right.memberId))
      );

      // R-17: agent C's assignment to member 2 is revoked by a second connection while agent C
      // logs; the command waits on the assignment row, then refuses and writes nothing.
      const beforeRace = await storedRows();
      const agentC = ksActor(ids.agentC, 'agent');
      const raced = await raceAgainstHeldWrite({
        adminDb,
        probe: agentC.authority,
        hold: tx =>
          tx
            .update(agentClients)
            .set({ status: 'inactive' })
            .where(and(eq(agentClients.id, ids.client2), eq(agentClients.tenantId, KS_TENANT_ID))),
        act: () => log(agentC, { memberId: ids.member2, subject: 'raced' }),
      });
      assert.deepEqual(raced, { success: false, error: 'Member access denied' });
      assert.deepEqual(await storedRows(), beforeRace, 'no activity was written');
    },
    () => cleanups
  );
});
