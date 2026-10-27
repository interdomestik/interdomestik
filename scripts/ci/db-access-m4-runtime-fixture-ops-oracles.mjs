// Proposed parent-only OPS oracles. No runtime/kernel substitute or admission authority.
import assert from 'node:assert/strict';

export async function runOpsOracleCases(f) {
  const {
    admin,
    blocker,
    run,
    seedClaim,
    state,
    noOwnedSessions,
    waitDataBlocked,
    request,
    invoke,
    make,
    cookie,
    actor,
    staff,
    secondStaff,
    nonStaff,
    foreignStaff,
    dataRole,
    suffix,
  } = f;

  await run(
    'ops resolved lifecycle returns durable terminal denial without assignment effects',
    async () => {
      const id = 'ops_terminal_' + suffix;
      await seedClaim(id);
      await admin`update claim set case_lifecycle_state='resolved',recovery_lifecycle_state='resolved' where id=${id}`;
      const before = await state(id),
        r = request(id, staff);
      assert.equal(before.result.length, 0);
      const response = await invoke(r);
      assert.deepEqual(response, {
        status: 'completed',
        operationId: r.operationId,
        replayed: false,
        result: { success: false, error: 'Cannot perform assign on a terminal claim.' },
      });
      const after = await state(id);
      assert.deepEqual(after.claim, before.claim);
      assert.deepEqual(after.audit, before.audit);
      assert.equal(after.result.length, 1);
      assert.equal(after.result[0].operation_id, r.operationId);
      assert.deepEqual(after.result[0].response, response.result);
      await noOwnedSessions();
      const replay = await invoke(r);
      assert.deepEqual(replay, { ...response, replayed: true });
      await noOwnedSessions();
      assert.deepEqual(await state(id), after);
    }
  );

  await run(
    'ops foreign and nonstaff targets produce exact durable ineligible denials',
    async () => {
      const nonStaffId = 'ops_nonstaff_' + suffix;
      await seedClaim(nonStaffId);
      const nonStaffBefore = await state(nonStaffId),
        nonStaffRequest = request(nonStaffId, nonStaff);
      assert.equal(nonStaffBefore.result.length, 0);
      const nonStaffResponse = await invoke(nonStaffRequest);
      assert.deepEqual(nonStaffResponse, {
        status: 'completed',
        operationId: nonStaffRequest.operationId,
        replayed: false,
        result: { success: false, error: 'Staff member not found or out of scope' },
      });
      const nonStaffAfter = await state(nonStaffId);
      assert.deepEqual(nonStaffAfter.claim, nonStaffBefore.claim);
      assert.deepEqual(nonStaffAfter.audit, nonStaffBefore.audit);
      assert.equal(nonStaffAfter.result.length, 1);
      assert.equal(nonStaffAfter.result[0].operation_id, nonStaffRequest.operationId);
      assert.deepEqual(nonStaffAfter.result[0].response, nonStaffResponse.result);
      await noOwnedSessions();
      assert.deepEqual(await state(nonStaffId), nonStaffAfter);

      const foreignId = 'ops_foreign_' + suffix;
      await seedClaim(foreignId);
      const foreignBefore = await state(foreignId),
        foreignRequest = request(foreignId, foreignStaff);
      assert.equal(foreignBefore.result.length, 0);
      const foreignResponse = await invoke(foreignRequest);
      assert.deepEqual(foreignResponse, {
        status: 'completed',
        operationId: foreignRequest.operationId,
        replayed: false,
        result: { success: false, error: 'Staff member not found or out of scope' },
      });
      const foreignAfter = await state(foreignId);
      assert.deepEqual(foreignAfter.claim, foreignBefore.claim);
      assert.deepEqual(foreignAfter.audit, foreignBefore.audit);
      assert.equal(foreignAfter.result.length, 1);
      assert.equal(foreignAfter.result[0].operation_id, foreignRequest.operationId);
      assert.deepEqual(foreignAfter.result[0].response, foreignResponse.result);
      await noOwnedSessions();
      assert.deepEqual(await state(foreignId), foreignAfter);
      const settledNonStaff = await state(nonStaffId);
      assert.deepEqual(settledNonStaff, nonStaffAfter);
    }
  );

  await run(
    'ops target role change blocks and is reread under the actual target share lock',
    async () => {
      const id = 'ops_target_role_race_' + suffix;
      await seedClaim(id);
      const before = await state(id),
        r = request(id, secondStaff);
      const [targetBefore] = await admin`select id,role from "user" where id=${secondStaff}`;
      assert.deepEqual(targetBefore, { id: secondStaff, role: 'staff' });
      assert.equal(secondStaff === actor, false);
      assert.equal(before.result.length, 0);
      const owner = make();
      let release, ready;
      const released = new Promise(resolve => (release = resolve)),
        acquired = new Promise(resolve => (ready = resolve));
      // Only this parent connection holds the target UPDATE. The tested child gets no callback.
      const hold = blocker.begin(async tx => {
        const [{ pid }] = await tx`select pg_backend_pid() as pid`;
        const rows =
          await tx`update "user" set role='member' where id=${secondStaff} returning id,role`;
        ready({ pid, rows });
        await released;
      });
      let pending;
      try {
        // A failed blocker rejects readiness instead of leaving an unobserved promise hanging.
        const lockState = await Promise.race([acquired, hold]);
        assert.deepEqual(lockState.rows, [{ id: secondStaff, role: 'member' }]);
        const blockerPid = lockState.pid;
        assert.equal(Number.isInteger(blockerPid), true);
        pending = invoke(r, cookie, owner);
        const blockedRows = await waitDataBlocked();
        assert.equal(
          blockedRows.some(row => row.usename === dataRole && row.blockers.includes(blockerPid)),
          true
        );
        release();
        await hold;
        const response = await pending;
        assert.deepEqual(response, {
          status: 'completed',
          operationId: r.operationId,
          replayed: false,
          result: { success: false, error: 'Staff member not found or out of scope' },
        });
        const after = await state(id);
        assert.deepEqual(after.claim, before.claim);
        assert.deepEqual(after.audit, before.audit);
        assert.equal(after.result.length, 1);
        assert.equal(after.result[0].operation_id, r.operationId);
        assert.deepEqual(after.result[0].response, response.result);
        await noOwnedSessions();
        assert.deepEqual(await state(id), after);
      } finally {
        release();
        try {
          await hold;
        } finally {
          try {
            await owner.close();
          } finally {
            try {
              if (pending) await pending;
            } finally {
              try {
                await noOwnedSessions();
              } finally {
                await admin`update "user" set role=${targetBefore.role} where id=${secondStaff}`;
              }
            }
          }
        }
      }
      const [restoredTarget] = await admin`select id,role from "user" where id=${secondStaff}`;
      assert.deepEqual(restoredTarget, targetBefore);
    }
  );
}
