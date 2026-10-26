import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { runProfileGroup1 } from './db-access-m4-runtime-fixture-profiles-1.mjs';
import { runProfileGroup2 } from './db-access-m4-runtime-fixture-profiles-2.mjs';
import { runProfileGroup3 } from './db-access-m4-runtime-fixture-profiles-3.mjs';
// Shared oracle values are parent-owned; case order and assertions are unchanged.
export async function runProfileCases(f) {
  const {
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
  } = f;
  const observation = JSON.stringify({
    ip: '192.0.2.10',
    userAgent: 'Synthetic M4 profile SQL proof',
  });
  const req = (claimId, staffId = staff, operationId = randomUUID()) => ({
    version: 1,
    command: 'm4.legacy.assign-claim',
    operationId,
    claimId,
    ...(staffId === undefined ? {} : { staffId }),
  });
  const invoke = (entry, r, proof = cookie) =>
    runtime[entry](proof, JSON.stringify(r), observation);
  const noticeId = r => 'ntf_m4_assignment_' + r.operationId;
  async function notification(r) {
    return await admin`select * from notifications where id=${noticeId(r)}`;
  }
  async function effects(...ids) {
    return {
      states: await Promise.all(ids.map(id => state(id))),
      notices: Array.from(
        await admin`
      select * from notifications where tenant_id in (${home},${foreign}) order by id`
      ),
    };
  }
  function denialLedger(rows, r, error, profile = 'legacy-admin') {
    assert.equal(rows.length, 1, 'Exactly the denied UUID is durable');
    const [row] = rows;
    assert(row.created_at instanceof Date);
    assert(Number.isFinite(row.created_at.getTime()));
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify([r.version, r.command, actor, home, r.claimId, r.staffId, profile]))
      .digest('hex');
    assert.deepEqual(row, {
      operation_id: r.operationId,
      tenant_id: home,
      actor_id: actor,
      claim_id: r.claimId,
      command: r.command,
      version: r.version,
      request_fingerprint: requestFingerprint,
      response: { result: { success: false, error }, changed: false },
      created_at: row.created_at,
    });
  }
  async function awaitNotice(r) {
    const until = performance.now() + 3000;
    do {
      const rows = await notification(r);
      if (rows.length) return rows;
      await new Promise(r => setTimeout(r, 10));
    } while (performance.now() < until);
    assert.fail('Committed assignment notification absent');
  }
  async function drain() {
    await noOwnedSessions();
  }
  async function actorRole(role, branch = null) {
    await admin`update "user" set role=${role},branch_id=${branch} where id=${actor}`;
  }
  async function targetRole(id, role, branch = null) {
    await admin`update "user" set role=${role},branch_id=${branch} where id=${id}`;
  }
  const success = 'profile_success_' + suffix,
    successRequest = req(success);
  const context = {
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
  };
  await runProfileGroup1(context);
  await runProfileGroup2(context);
  await runProfileGroup3(context);
}
