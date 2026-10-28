import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
const programs = ['runAdminAssignment', 'runAgentAssignment', 'runStaffAssignment'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export const compiledDigest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function request(row, operationId) {
  return {
    version: 1,
    command: row.profile === 'staff' ? 'm4.staff.assign-claim' : 'm4.legacy.assign-claim',
    operationId,
    claimId: row.claimId,
    ...(row.profile === 'staff' ? {} : { staffId: row.staffId }),
  };
}

// Pure comparisons only. Calling this function never creates execution provenance.
export function validateM4CompiledObservations({
  cases,
  browser,
  owner,
  actionMap,
  sql,
  denialSql,
}) {
  assert.deepEqual(
    cases.map(row => row.profile),
    profiles
  );
  assert.equal(new Set(cases.map(row => row.claimId)).size, 3);
  assert.equal(browser.version, 1);
  assert.equal(browser.complete, true);
  assert.deepEqual(denialSql, { ledger: [], audit: [] });
  assert.equal(browser.rows.length, 3);
  assert.equal(owner.version, 1);
  assert.equal(owner.localQualificationOnly, false);
  assert.equal(owner.loopbackQualification, false);
  assert.equal(owner.constructorName, 'startM4PrivateAssignmentOwner');
  assert.equal(owner.contexts.localQualificationOnly, false);
  assert.equal(owner.contexts.loopbackQualification, false);
  assert.equal(owner.contexts.constructorName, 'createM4PrivateAssignmentRuntime');
  assert.equal(owner.transport.rows.length, 4);
  assert.equal(owner.contexts.rows.length, 4);
  assert.equal(sql.length, 3);
  const operations = new Set(),
    tuples = [];
  const all = [...browser.rows, browser.denial];
  for (const [index, observed] of all.entries()) {
    assert(observed && uuid.test(observed.operationId));
    assert(!operations.has(observed.operationId));
    operations.add(observed.operationId);
    const denial = index === 3,
      expected = cases[denial ? 0 : index];
    assert.equal(observed.profile, expected.profile);
    assert.equal(observed.claimId, expected.claimId);
    assert.equal(actionMap[observed.frameworkActionId], programs[denial ? 0 : index]);
    assert.equal(observed.warmHit, true);
    assert.equal(typeof observed.firstCacheToken, 'string');
    assert(observed.firstCacheToken.length > 0 && observed.firstCacheToken.length <= 256);
    const rawResponse = denial
      ? { status: 'denied', reason: 'UNAUTHORIZED' }
      : {
          status: 'completed',
          operationId: observed.operationId,
          replayed: false,
          result: { success: true },
          changed: true,
        };
    const expectedBrowser = {
      outcome: 'settled',
      operationId: observed.operationId,
      result: denial ? { success: false, error: 'Unauthorized' } : { success: true },
    };
    assert.deepEqual(observed.browserResult, expectedBrowser);
    if (denial) assert.equal(observed.refreshedCacheToken, observed.firstCacheToken);
    else {
      assert.equal(observed.refreshedHit, true);
      assert.equal(typeof observed.refreshedCacheToken, 'string');
      assert(observed.refreshedCacheToken.length > 0 && observed.refreshedCacheToken.length <= 256);
      assert.notEqual(observed.refreshedCacheToken, observed.firstCacheToken);
    }
    const requestDigest = compiledDigest(request(expected, observed.operationId)),
      responseDigest = compiledDigest(rawResponse);
    const transport = owner.transport.rows[index],
      context = owner.contexts.rows[index];
    assert.deepEqual(transport, {
      profile: expected.profile,
      path: '/m4/assignment/' + expected.profile,
      operationId: observed.operationId,
      requestDigest,
      responseDigest,
      outcome: denial ? 'denied' : 'completed',
      delivery: 'finished',
    });
    assert.deepEqual(context, {
      ordinal: index + 1,
      profile: expected.profile,
      receiver: 'posture-checked-owned-data-drizzle',
      verifier: 'owned-current-store-identity-drizzle',
      configurationIdentityChecked: true,
      capturedAfterPosture: true,
      operationId: observed.operationId,
      requestDigest,
      responseDigest,
    });
    if (!denial) assertSql(expected, observed.operationId, sql[index]);
    tuples.push({
      profile: expected.profile,
      claimId: expected.claimId,
      actorId: denial ? null : expected.actorId,
      tenantId: expected.tenantId,
      operationId: observed.operationId,
      program: programs[denial ? 0 : index],
      frameworkActionId: observed.frameworkActionId,
      requestDigest,
      responseDigest,
      runtimeOrdinal: index + 1,
      outcome: denial ? 'denied' : 'completed',
    });
  }
  // The administrator query covers all fixture claims, including the rejected second request.
  assert(
    !sql.some(row => row.result.some(result => result.operation_id === browser.denial.operationId))
  );
  return Object.freeze(tuples.map(row => Object.freeze(row)));
}

function assertSql(expected, operationId, state) {
  assert.equal(state.claim.length, 1);
  assert.equal(state.claim[0].id, expected.claimId);
  assert.equal(state.claim[0].tenant_id, expected.tenantId);
  assert.equal(state.claim[0].staffId, expected.staffId);
  assert.equal(state.target.length, 1);
  assert.equal(state.target[0].id, expected.staffId);
  assert.equal(state.target[0].role, 'staff');
  assert.equal(state.target[0].tenant_id, expected.tenantId);
  assert.equal(state.target[0].emailVerified, false);
  assert.equal(state.audit.length, 1);
  const audit = state.audit[0];
  assert.equal(audit.actor_id, expected.actorId);
  assert.equal(audit.actor_role, expected.profile === 'staff' ? 'staff' : 'admin');
  assert.equal(audit.tenant_id, expected.tenantId);
  assert.equal(audit.entity_id, expected.claimId);
  assert.equal(audit.entity_type, 'claim');
  assert.equal(audit.action, 'claim.assigned');
  assert.equal(audit.metadata.previousStaffId, null);
  assert.equal(audit.metadata.newStaffId, expected.staffId);
  assert.equal(audit.metadata.requestObservation.provenance, 'web-relay-reported');
  assert.equal(audit.metadata.requestObservation.authoritative, false);
  assert.equal(state.result.length, 1);
  const result = state.result[0],
    command = expected.profile === 'staff' ? 'm4.staff.assign-claim' : 'm4.legacy.assign-claim';
  for (const [field, value] of Object.entries({
    operation_id: operationId,
    tenant_id: expected.tenantId,
    actor_id: expected.actorId,
    claim_id: expected.claimId,
    command,
    version: 1,
  }))
    assert.equal(result[field], value);
  assert.equal(
    result.request_fingerprint,
    compiledDigest([
      1,
      command,
      expected.actorId,
      expected.tenantId,
      expected.claimId,
      expected.staffId,
      expected.profile,
    ])
  );
  assert.deepEqual(result.response, { result: { success: true }, changed: true });
  assert.equal(state.notifications.length, expected.profile === 'staff' ? 0 : 1);
  if (expected.profile !== 'staff') {
    const notice = state.notifications[0];
    assert.equal(notice.id, 'ntf_m4_assignment_' + operationId);
    assert.equal(notice.tenant_id, expected.tenantId);
    assert.equal(notice.user_id, expected.staffId);
    assert.equal(notice.type, 'claim_assigned');
    assert.equal(notice.action_url, '/staff/claims/' + expected.claimId);
  }
}
