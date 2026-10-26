import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
export async function runProfileGroup2(context) {
  const {
    f,
    admin,
    runtime,
    run,
    seedClaim,
    state,
    noOwnedSessions,
    cookie,
    actor,
    staff,
    secondStaff,
    nonStaff,
    foreignStaff,
    home,
    foreign,
    branchA,
    branchB,
    suffix,
    postgres,
    dataUrl,
    notificationUrl,
    notificationRole,
    dataRole,
    quote,
    code,
    observation,
    req,
    invoke,
    noticeId,
    notification,
    effects,
    denialLedger,
    awaitNotice,
    drain,
    actorRole,
    targetRole,
    success,
    successRequest,
  } = context;
  await run(
    'current role downgrade blocks prior administrator replay for another target',
    async () => {
      await actorRole('staff');
      try {
        assert.deepEqual(await invoke('executeLegacyAdmin', successRequest), {
          status: 'denied',
          reason: 'SELF_ASSIGNMENT_ONLY',
        });
      } finally {
        await actorRole('admin');
      }
      await drain();
    }
  );
  await run(
    'foreign and nonstaff assignment targets yield durable denials without assignment audit or notice',
    async () => {
      for (const target of [foreignStaff, nonStaff]) {
        const id = 'profile_bad_target_' + randomUUID();
        await seedClaim(id);
        const r = req(id, target),
          before = await effects(id);
        assert.equal(before.states[0].result.length, 0);
        const result = await invoke('executeLegacyAdmin', r);
        assert.deepEqual(result, {
          status: 'completed',
          operationId: r.operationId,
          replayed: false,
          result: {
            success: false,
            error: 'Staff member not found',
            data: undefined,
          },
          changed: false,
        });
        const after = await effects(id);
        assert.deepEqual(after.states[0].claim, before.states[0].claim);
        assert.deepEqual(after.states[0].audit, before.states[0].audit);
        denialLedger(after.states[0].result, r, 'Staff member not found');
        assert.deepEqual(after.notices, before.notices);
        assert.deepEqual(await invoke('executeLegacyAdmin', r), {
          ...result,
          replayed: true,
        });
        assert.deepEqual(await effects(id), after, 'Denied UUID replay must preserve every effect');
        await drain();
        assert.deepEqual(
          await effects(id),
          after,
          'Denied UUID replay must remain effect-free after owned work drains'
        );
      }
    }
  );
  await run(
    'historical nonstaff noop link is preserved and rejected after current eligibility check',
    async () => {
      const id = 'profile_historical_' + suffix;
      await seedClaim(id);
      await admin`update claim set "staffId"=${nonStaff} where id=${id}`;
      const before = await state(id),
        r = req(id, nonStaff),
        result = await invoke('executeLegacyAdmin', r);
      assert.equal(result.result.success, false);
      assert.deepEqual((await state(id)).claim, before.claim);
      assert.equal((await state(id)).audit.length, 0);
      await drain();
    }
  );
  await run(
    'staff omitted target assigns current actor and explicit null clears assignment timestamps',
    async () => {
      await actorRole('staff');
      const id = 'profile_staff_self_' + suffix;
      await seedClaim(id);
      try {
        const r = { ...req(id), command: 'm4.staff.assign-claim' };
        delete r.staffId;
        const result = await invoke('executeStaff', r);
        assert.equal(result.result.success, true);
        assert.equal(result.changed, true);
        const assigned = await state(id);
        assert.equal(assigned.claim[0].staffId, actor);
        assert.equal(assigned.claim[0].assignedById, actor);
        assert(assigned.claim[0].assignedAt);
        const cleared = await invoke('executeStaff', {
          ...req(id, null),
          command: 'm4.staff.assign-claim',
        });
        assert.equal(cleared.result.success, true);
        const after = await state(id);
        assert.equal(after.claim[0].staffId, null);
        assert.equal(after.claim[0].assignedAt, null);
        assert.equal(after.claim[0].assignedById, null);
        assert.equal(after.audit.length, 2);
        await drain();
      } finally {
        await actorRole('admin');
      }
    }
  );
  await run(
    'staff current branch constrains both resource and target while sibling context remains usable',
    async () => {
      await actorRole('staff', branchA);
      await targetRole(staff, 'staff', branchA);
      await targetRole(secondStaff, 'staff', branchB);
      try {
        const id = 'profile_branch_' + suffix,
          other = 'profile_other_branch_' + suffix;
        await seedClaim(id);
        await seedClaim(other);
        await admin`update claim set branch_id=${branchA} where id=${id}`;
        await admin`update claim set branch_id=${branchB} where id=${other}`;
        const wrong = {
            ...req(id, secondStaff),
            command: 'm4.staff.assign-claim',
          },
          beforeTarget = await effects(id, other);
        assert.equal(beforeTarget.states[0].result.length, 0);
        assert.deepEqual(await invoke('executeStaff', wrong), {
          status: 'completed',
          operationId: wrong.operationId,
          replayed: false,
          result: {
            success: false,
            error: 'Staff member not found or out of scope',
          },
          changed: false,
        });
        const afterTarget = await effects(id, other);
        assert.deepEqual(afterTarget.states[0].claim, beforeTarget.states[0].claim);
        assert.deepEqual(afterTarget.states[0].audit, beforeTarget.states[0].audit);
        denialLedger(
          afterTarget.states[0].result,
          wrong,
          'Staff member not found or out of scope',
          'staff'
        );
        assert.deepEqual(afterTarget.states[1], beforeTarget.states[1]);
        assert.deepEqual(afterTarget.notices, beforeTarget.notices);
        await drain();
        assert.deepEqual(
          await effects(id, other),
          afterTarget,
          'Wrong target effects checked before next request'
        );
        const deniedResource = {
          ...req(other, staff),
          command: 'm4.staff.assign-claim',
        };
        assert.deepEqual(await invoke('executeStaff', deniedResource), {
          status: 'denied',
          reason: 'RESOURCE_DENIED',
        });
        assert.deepEqual(
          await effects(id, other),
          afterTarget,
          'Wrong resource must change neither claim, audit, ledger nor notifications'
        );
        await drain();
        assert.deepEqual(
          await effects(id, other),
          afterTarget,
          'Each denial is settled before the later positive'
        );
        assert.equal(
          (
            await invoke('executeStaff', {
              ...req(id, staff),
              command: 'm4.staff.assign-claim',
            })
          ).result.success,
          true
        );
        assert.equal((await state(other)).audit.length, 0);
        await drain();
      } finally {
        await actorRole('admin');
        await targetRole(staff, 'staff');
        await targetRole(secondStaff, 'staff');
      }
    }
  );
  await run(
    'mandatory audit failure rolls back assignment and ledger and never dispatches notification',
    async () => {
      const id = 'profile_audit_fail_' + suffix;
      await seedClaim(id);
      const r = req(id),
        before = await state(id);
      const fn = 'm4_audit_fault_' + suffix.replaceAll('-', ''),
        tr = fn + '_tr';
      await admin.unsafe(
        `CREATE FUNCTION ${quote(fn)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${id}' THEN RAISE EXCEPTION 'owned audit fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${quote(tr)} BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ${quote(fn)}()`
      );
      try {
        assert.deepEqual(await invoke('executeLegacyAdmin', r), {
          status: 'indeterminate',
          operationId: r.operationId,
        });
        assert.deepEqual(await state(id), before);
        await drain();
        assert.equal((await notification(r)).length, 0);
      } finally {
        await admin.unsafe(`DROP TRIGGER ${quote(tr)} ON audit_log; DROP FUNCTION ${quote(fn)}()`);
      }
      assert.equal((await invoke('executeLegacyAdmin', r)).result.success, true);
      await awaitNotice(r);
      await drain();
    }
  );
}
