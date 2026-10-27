// Fixed administrator-side SQL oracles; the restricted child executes the real adapters.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const locales = ['sq', 'en', 'sr', 'mk'];
function expectedPaths(claimId, staffOnly = false) {
  const paths = staffOnly
    ? [`/staff/claims/${claimId}`, '/staff/claims']
    : [
        '/member/claims',
        `/member/claims/${claimId}`,
        '/admin/claims',
        `/admin/claims/${claimId}`,
        '/staff/claims',
        `/staff/claims/${claimId}`,
      ];
  return paths.flatMap(path => locales.map(locale => `/${locale}${path}`));
}

export async function runMountedAssignmentCases(f) {
  const { admin, actor, staff, home, branchA, suffix, cookie, seedClaim, state, run } = f;
  await run('mounted-admin-assignment-source-route', async () => {
    await admin`update "user" set role='admin',branch_id=null where id=${actor}`;
    await admin`update "user" set role='staff',branch_id=null where id=${staff}`;
    const claimId = 'mounted_admin_' + suffix,
      operationId = randomUUID();
    await seedClaim(claimId);
    const owner = f.make();
    const response = await f.client.invokeMounted(owner, 'legacy-admin', {
      claimId,
      staffId: staff,
      operationId,
      cookie,
    });
    assert.equal(response.result.success, true);
    assert.deepEqual(response.cachePaths, expectedPaths(claimId));
    await owner.close();
    await f.noOwnedSessions();
    const after = await state(claimId);
    assert.equal(after.claim[0].staffId, staff);
    assert.equal(after.audit.length, 1);
    assert.equal(after.audit[0].actor_id, actor);
    assert.equal(after.audit[0].tenant_id, home);
    assert.equal(after.result.length, 1);
    assert.equal(after.result[0].operation_id, operationId);
    const notices =
      await admin`select id from notifications where id=${'ntf_m4_assignment_' + operationId}`;
    assert.equal(notices.length, 1);
  });
  await run('mounted-agent-assignment-source-route', async () => {
    await admin`update "user" set role='admin',branch_id=null where id=${actor}`;
    const claimId = 'mounted_agent_' + suffix,
      operationId = randomUUID();
    await seedClaim(claimId);
    const owner = f.make();
    const response = await f.client.invokeMounted(owner, 'legacy-agent', {
      claimId,
      staffId: staff,
      operationId,
      cookie,
    });
    assert.equal(response.result.success, true);
    assert.deepEqual(response.cachePaths, expectedPaths(claimId));
    await owner.close();
    await f.noOwnedSessions();
    const after = await state(claimId);
    assert.equal(after.claim[0].staffId, staff);
    assert.equal(after.audit.length, 1);
    assert.equal(after.audit[0].actor_id, actor);
    assert.equal(after.audit[0].tenant_id, home);
    assert.equal(after.result.length, 1);
    assert.equal(after.result[0].operation_id, operationId);
    const notices =
      await admin`select id from notifications where id=${'ntf_m4_assignment_' + operationId}`;
    assert.equal(notices.length, 1);
  });
  await run('mounted-staff-assignment-source-route', async () => {
    try {
      await admin`update "user" set role='staff',branch_id=${branchA} where id=${actor}`;
      const claimId = 'mounted_staff_' + suffix,
        operationId = randomUUID();
      await seedClaim(claimId);
      await admin`update claim set branch_id=${branchA} where id=${claimId}`;
      const owner = f.make();
      const response = await f.client.invokeMounted(owner, 'staff', {
        claimId,
        operationId,
        cookie,
      });
      assert.equal(response.result.success, true);
      assert.deepEqual(response.cachePaths, expectedPaths(claimId, true));
      await owner.close();
      await f.noOwnedSessions();
      const after = await state(claimId);
      assert.equal(after.claim[0].staffId, actor);
      assert.equal(after.audit.length, 1);
      assert.equal(after.audit[0].actor_id, actor);
      assert.equal(after.audit[0].tenant_id, home);
      assert.equal(after.result.length, 1);
      assert.equal(after.result[0].operation_id, operationId);
      const notices =
        await admin`select id from notifications where id=${'ntf_m4_assignment_' + operationId}`;
      assert.equal(notices.length, 0);
    } finally {
      await admin`update "user" set role='admin',branch_id=null where id=${actor}`;
    }
  });
}
