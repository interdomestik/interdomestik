// Fixed parent-only oracle; the real restricted child executes every staff request.
import assert from 'node:assert/strict';

export async function runStaffNoopTerminalCase(context) {
  const {
    admin,
    run,
    seedClaim,
    actor,
    staff,
    home,
    branchA,
    suffix,
    req,
    invoke,
    effects,
    drain,
    actorRole,
    targetRole,
  } = context;
  await run(
    'staff eligible terminal noops precede terminal mutation denials and preserve every effect',
    async () => {
      const [originalActor] =
        await admin`select id,tenant_id,role,branch_id from "user" where id=${actor}`;
      const [originalTarget] =
        await admin`select id,tenant_id,role,branch_id from "user" where id=${staff}`;
      assert.deepEqual(originalActor, {
        id: actor,
        tenant_id: home,
        role: 'admin',
        branch_id: null,
      });
      assert.deepEqual(originalTarget, {
        id: staff,
        tenant_id: home,
        role: 'staff',
        branch_id: null,
      });
      const selfId = 'staff_terminal_self_' + suffix;
      const differentId = 'staff_terminal_other_' + suffix;
      const clearId = 'staff_terminal_clear_' + suffix;
      const emptyId = 'staff_terminal_empty_' + suffix;
      const assignedAt = new Date('2025-01-02T03:04:05.000Z');
      const updatedAt = new Date('2025-01-03T04:05:06.000Z');
      try {
        await actorRole('staff', branchA);
        await targetRole(staff, 'staff', branchA);
        const activeRows = Array.from(
          await admin`select id,tenant_id,role,branch_id from "user" where id in (${actor},${staff}) order by id`
        );
        assert.deepEqual(activeRows, [
          { id: actor, tenant_id: home, role: 'staff', branch_id: branchA },
          { id: staff, tenant_id: home, role: 'staff', branch_id: branchA },
        ]);
        await seedClaim(selfId);
        await seedClaim(differentId);
        await seedClaim(clearId);
        await seedClaim(emptyId);
        await admin`update claim set "staffId"=${actor},"assignedAt"=${assignedAt},"assignedById"=${actor},"updatedAt"=${updatedAt},branch_id=${branchA},case_lifecycle_state='resolved',recovery_lifecycle_state='resolved' where id in (${selfId},${differentId},${clearId}) and tenant_id=${home}`;
        await admin`update claim set case_lifecycle_state='rejected',recovery_lifecycle_state='closed' where id=${differentId} and tenant_id=${home}`;
        await admin`update claim set "staffId"=null,"assignedAt"=null,"assignedById"=null,"updatedAt"=${updatedAt},branch_id=${branchA},case_lifecycle_state='rejected',recovery_lifecycle_state='closed' where id=${emptyId} and tenant_id=${home}`;
        const before = await effects(selfId, differentId, clearId, emptyId);
        assert.deepEqual(
          before.states.map(row => row.result),
          [[], [], [], []]
        );
        assert.deepEqual(
          before.states.map(row => row.audit),
          [[], [], [], []]
        );
        assert.deepEqual(
          before.states.map(row => row.claim.length),
          [1, 1, 1, 1]
        );
        assert.deepEqual(
          before.states.map(row => [
            row.claim[0].id,
            row.claim[0].tenant_id,
            row.claim[0].branch_id,
            row.claim[0].staffId,
            row.claim[0].assignedAt,
            row.claim[0].assignedById,
            row.claim[0].updatedAt,
            row.claim[0].case_lifecycle_state,
            row.claim[0].recovery_lifecycle_state,
          ]),
          [
            [selfId, home, branchA, actor, assignedAt, actor, updatedAt, 'resolved', 'resolved'],
            [differentId, home, branchA, actor, assignedAt, actor, updatedAt, 'rejected', 'closed'],
            [clearId, home, branchA, actor, assignedAt, actor, updatedAt, 'resolved', 'resolved'],
            [emptyId, home, branchA, null, null, null, updatedAt, 'rejected', 'closed'],
          ]
        );

        const selfRequest = { ...req(selfId, actor), command: 'm4.staff.assign-claim' };
        delete selfRequest.staffId;
        const selfResponse = await invoke('executeStaff', selfRequest);
        assert.deepEqual(selfResponse, {
          status: 'completed',
          operationId: selfRequest.operationId,
          replayed: false,
          result: { success: true },
          changed: false,
        });
        const selfAfter = await effects(selfId, differentId, clearId, emptyId);
        assert.equal(selfAfter.states[0].result.length, 1);
        assert.equal(selfAfter.states[0].result[0].operation_id, selfRequest.operationId);
        assert.deepEqual(selfAfter.states[0].result[0].response, {
          result: { success: true },
          changed: false,
        });
        assert.deepEqual(selfAfter, {
          ...before,
          states: [
            { ...before.states[0], result: selfAfter.states[0].result },
            ...before.states.slice(1),
          ],
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          selfAfter,
          'self: original response must remain effect-free after drain'
        );
        assert.deepEqual(await invoke('executeStaff', selfRequest), {
          ...selfResponse,
          replayed: true,
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          selfAfter,
          'self: exact UUID replay must preserve all four claims, audits, ledgers and notices'
        );

        const differentRequest = { ...req(differentId, staff), command: 'm4.staff.assign-claim' };
        const differentResponse = await invoke('executeStaff', differentRequest);
        assert.deepEqual(differentResponse, {
          status: 'completed',
          operationId: differentRequest.operationId,
          replayed: false,
          result: { success: false, error: 'Cannot perform assign on a terminal claim.' },
          changed: false,
        });
        const differentAfter = await effects(selfId, differentId, clearId, emptyId);
        assert.equal(differentAfter.states[1].result.length, 1);
        assert.equal(differentAfter.states[1].result[0].operation_id, differentRequest.operationId);
        assert.deepEqual(differentAfter.states[1].result[0].response, {
          result: { success: false, error: 'Cannot perform assign on a terminal claim.' },
          changed: false,
        });
        assert.deepEqual(differentAfter, {
          ...selfAfter,
          states: [
            ...selfAfter.states.slice(0, 1),
            { ...selfAfter.states[1], result: differentAfter.states[1].result },
            ...selfAfter.states.slice(2),
          ],
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          differentAfter,
          'different: original response must remain effect-free after drain'
        );
        assert.deepEqual(await invoke('executeStaff', differentRequest), {
          ...differentResponse,
          replayed: true,
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          differentAfter,
          'different: exact UUID replay must preserve all four claims, audits, ledgers and notices'
        );

        const clearRequest = { ...req(clearId, null), command: 'm4.staff.assign-claim' };
        const clearResponse = await invoke('executeStaff', clearRequest);
        assert.deepEqual(clearResponse, {
          status: 'completed',
          operationId: clearRequest.operationId,
          replayed: false,
          result: { success: false, error: 'Cannot perform assign on a terminal claim.' },
          changed: false,
        });
        const clearAfter = await effects(selfId, differentId, clearId, emptyId);
        assert.equal(clearAfter.states[2].result.length, 1);
        assert.equal(clearAfter.states[2].result[0].operation_id, clearRequest.operationId);
        assert.deepEqual(clearAfter.states[2].result[0].response, {
          result: { success: false, error: 'Cannot perform assign on a terminal claim.' },
          changed: false,
        });
        assert.deepEqual(clearAfter, {
          ...differentAfter,
          states: [
            ...differentAfter.states.slice(0, 2),
            { ...differentAfter.states[2], result: clearAfter.states[2].result },
            ...differentAfter.states.slice(3),
          ],
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          clearAfter,
          'clear: original response must remain effect-free after drain'
        );
        assert.deepEqual(await invoke('executeStaff', clearRequest), {
          ...clearResponse,
          replayed: true,
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          clearAfter,
          'clear: exact UUID replay must preserve all four claims, audits, ledgers and notices'
        );

        const emptyRequest = { ...req(emptyId, null), command: 'm4.staff.assign-claim' };
        const emptyResponse = await invoke('executeStaff', emptyRequest);
        assert.deepEqual(emptyResponse, {
          status: 'completed',
          operationId: emptyRequest.operationId,
          replayed: false,
          result: { success: true },
          changed: false,
        });
        const emptyAfter = await effects(selfId, differentId, clearId, emptyId);
        assert.equal(emptyAfter.states[3].result.length, 1);
        assert.equal(emptyAfter.states[3].result[0].operation_id, emptyRequest.operationId);
        assert.deepEqual(emptyAfter.states[3].result[0].response, {
          result: { success: true },
          changed: false,
        });
        assert.deepEqual(emptyAfter, {
          ...clearAfter,
          states: [
            ...clearAfter.states.slice(0, 3),
            { ...clearAfter.states[3], result: emptyAfter.states[3].result },
          ],
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          emptyAfter,
          'empty: original response must remain effect-free after drain'
        );
        assert.deepEqual(await invoke('executeStaff', emptyRequest), {
          ...emptyResponse,
          replayed: true,
        });
        await drain();
        assert.deepEqual(
          await effects(selfId, differentId, clearId, emptyId),
          emptyAfter,
          'empty: exact UUID replay must preserve all four claims, audits, ledgers and notices'
        );
      } finally {
        try {
          await drain();
        } finally {
          try {
            await actorRole(originalActor.role, originalActor.branch_id);
          } finally {
            await targetRole(staff, originalTarget.role, originalTarget.branch_id);
          }
        }
      }
      const [restoredActor] =
        await admin`select id,tenant_id,role,branch_id from "user" where id=${actor}`;
      const [restoredTarget] =
        await admin`select id,tenant_id,role,branch_id from "user" where id=${staff}`;
      assert.deepEqual(restoredActor, originalActor);
      assert.deepEqual(restoredTarget, originalTarget);
    }
  );
}
