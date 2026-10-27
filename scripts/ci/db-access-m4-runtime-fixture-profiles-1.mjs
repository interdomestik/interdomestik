import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
export async function runProfileGroup1(context) {
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
    'four literal profiles expose fixed methods and reject invalid observation before effects',
    async () => {
      assert.deepEqual(Object.keys(runtime).sort(), [
        'close',
        'execute',
        'executeLegacyAdmin',
        'executeLegacyAgent',
        'executeStaff',
      ]);
      assert.equal(Object.isFrozen(runtime), true);
      assert.deepEqual(
        await runtime.executeLegacyAdmin(cookie, JSON.stringify(successRequest), '{}'),
        { status: 'denied', reason: 'INVALID_REQUEST' }
      );
      assert.deepEqual(
        await runtime.executeStaff(cookie, JSON.stringify(successRequest), observation),
        { status: 'denied', reason: 'INVALID_REQUEST' }
      );
      await drain();
    }
  );
  await run(
    'expanded runtime retains successful ops assignment response and atomic audit ledger',
    async () => {
      const id = 'profile_ops_' + suffix;
      await seedClaim(id);
      const before = await state(id);
      const r = { ...req(id), command: 'm4.ops.assign-owner' };
      const result = await runtime.execute(cookie, JSON.stringify(r));
      assert.equal(result.status, 'completed');
      assert.equal(result.result.success, true);
      assert.equal(result.result.data.id, id);
      assert.equal(result.result.data.staffId, staff);
      assert.equal(typeof result.result.data.assignedAt, 'string');
      assert.equal(result.changed, undefined);
      const after = await state(id);
      assert.equal(after.audit.length, 1);
      assert.equal(after.result.length, 1);
      assert.equal(after.claim[0].staffId, staff);
      assert.equal(after.claim[0].assignedById, actor);
      assert.equal(after.claim[0].assignedAt instanceof Date, true);
      assert.equal(after.claim[0].assignedAt.toISOString(), result.result.data.assignedAt);
      assert.equal(after.claim[0].updatedAt.getTime(), after.claim[0].assignedAt.getTime());
      assert.equal(typeof after.audit[0].id, 'string');
      assert.equal(after.audit[0].id.length > 0, true);
      assert.equal(after.audit[0].created_at instanceof Date, true);
      assert.equal(Number.isFinite(after.audit[0].created_at.getTime()), true);
      assert.deepEqual(after.audit[0], {
        id: after.audit[0].id,
        tenant_id: home,
        actor_id: actor,
        actor_role: null,
        action: 'assign_owner',
        entity_type: 'claim',
        entity_id: id,
        metadata: {
          previousStaffId: before.claim[0].staffId,
          newStaffId: staff,
          claimNumber: before.claim[0].claim_number,
        },
        created_at: after.audit[0].created_at,
      });
      assert.deepEqual(result, {
        status: 'completed',
        operationId: r.operationId,
        replayed: false,
        result: {
          success: true,
          data: { id, staffId: staff, assignedAt: after.claim[0].assignedAt.toISOString() },
        },
      });
      assert.equal(after.result[0].operation_id, r.operationId);
      assert.deepEqual(after.result[0].response, result.result);
      await drain();
      assert.equal((await notification(r)).length, 0);
    }
  );
  await run(
    'legacy admin commits assignment audit ledger and independent notification using restricted purposes',
    async () => {
      await seedClaim(success);
      const before = await state(success);
      const result = await invoke('executeLegacyAdmin', successRequest);
      assert.equal(result.status, 'completed');
      assert.equal(result.result.success, true);
      assert.equal(result.changed, true);
      const after = await state(success);
      assert.equal(after.claim[0].staffId, staff);
      assert.equal(after.claim[0].assignedAt, before.claim[0].assignedAt);
      assert.equal(after.claim[0].assignedById, before.claim[0].assignedById);
      assert.equal(after.audit.length, 1);
      assert.equal(after.result.length, 1);
      assert.equal(after.audit[0].metadata.ip, '192.0.2.10');
      assert.equal(after.audit[0].metadata.requestObservation.authoritative, false);
      const rows = await awaitNotice(successRequest);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].user_id, staff);
      assert.equal(rows[0].tenant_id, home);
      assert.equal(rows[0].title, 'New Claim Assigned');
      assert.equal(rows[0].action_url, '/staff/claims/' + success);
      await drain();
    }
  );
  await run(
    'legacy replay returns durable result without duplicate audit or notification and aliases conflict',
    async () => {
      const before = await state(success);
      const result = await invoke('executeLegacyAdmin', successRequest);
      assert.equal(result.status, 'completed');
      assert.equal(result.replayed, true);
      assert.deepEqual(await invoke('executeLegacyAgent', successRequest), {
        status: 'denied',
        reason: 'OPERATION_CONFLICT',
      });
      assert.deepEqual(await state(success), before);
      assert.equal((await notification(successRequest)).length, 1);
      await drain();
    }
  );
  await run(
    'admin eligible noop preserves terminal case and emits neither audit nor notification',
    async () => {
      await admin`update claim set case_lifecycle_state='resolved',recovery_lifecycle_state='resolved' where id=${success}`;
      const r = req(success),
        before = await state(success),
        result = await invoke('executeLegacyAdmin', r);
      assert.equal(result.status, 'completed');
      assert.equal(result.result.success, true);
      assert.equal(result.changed, false);
      const after = await state(success);
      assert.deepEqual(after.claim, before.claim);
      assert.deepEqual(after.audit, before.audit);
      assert.equal(after.result.length, before.result.length + 1);
      await drain();
      assert.equal((await notification(r)).length, 0);
    }
  );
  await run(
    'agent terminal noop remains denial while active noop preserves its audit and notification behavior',
    async () => {
      const denied = req(success),
        result = await invoke('executeLegacyAgent', denied);
      assert.equal(result.status, 'completed');
      assert.equal(result.result.success, false);
      assert.equal(result.changed, false);
      await drain();
      assert.equal((await notification(denied)).length, 0);
      await admin`update claim set case_lifecycle_state='evaluation',recovery_lifecycle_state='not_started' where id=${success}`;
      const r = req(success),
        before = await state(success),
        afterResult = await invoke('executeLegacyAgent', r);
      assert.equal(afterResult.result.success, true);
      assert.equal(afterResult.changed, false);
      assert.equal((await state(success)).audit.length, before.audit.length + 1);
      await awaitNotice(r);
      await drain();
    }
  );
}
