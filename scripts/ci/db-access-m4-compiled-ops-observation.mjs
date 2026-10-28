import assert from 'node:assert/strict';
import { compiledDigest } from './db-access-m4-compiled-observations.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
// Pure oracle. Only the genuine executed compiled result may carry this data into a join.
export function validateM4StrictOps({ request, record, sql, expected, ownerInstanceId }) {
  assert(uuid.test(record.opsInstanceId));
  assert.notEqual(record.opsInstanceId, ownerInstanceId);
  assert.equal(request.command, 'm4.ops.assign-owner');
  assert(uuid.test(request.operationId));
  const { result, contexts } = record;
  assert.equal(contexts.version, 1);
  assert.equal(contexts.constructorName, 'createM4PrivateAssignmentRuntime');
  assert.equal(contexts.localQualificationOnly, false);
  assert.equal(contexts.loopbackQualification, false);
  assert.equal(contexts.rows.length, 1);
  assert.deepEqual(Object.keys(result).sort(), ['operationId', 'replayed', 'result', 'status']);
  assert.equal(result.status, 'completed');
  assert.equal(result.replayed, false);
  assert.equal(result.operationId, request.operationId);
  assert.equal(result.result.success, true);
  assert.deepEqual(Object.keys(result.result.data).sort(), ['assignedAt', 'id', 'staffId']);
  assert.equal(result.result.data.id, request.claimId);
  assert.equal(result.result.data.staffId, request.staffId);
  const stamp = result.result.data.assignedAt;
  assert.equal(new Date(stamp).toISOString(), stamp);
  const context = {
    ordinal: 1,
    profile: 'ops',
    receiver: 'posture-checked-owned-data-drizzle',
    verifier: 'owned-current-store-identity-drizzle',
    configurationIdentityChecked: true,
    capturedAfterPosture: true,
    operationId: request.operationId,
    requestDigest: compiledDigest(request),
    responseDigest: compiledDigest(result),
  };
  assert.deepEqual(contexts.rows[0], context);
  assert.equal(sql.claim.length, 1);
  const claim = sql.claim[0];
  assert.equal(claim.id, request.claimId);
  assert.equal(claim.tenant_id, expected.tenantId);
  assert.equal(claim.staffId, request.staffId);
  assert.equal(claim.assignedById, expected.actorId);
  assert.equal(new Date(claim.assignedAt).toISOString(), stamp);
  assert.equal(sql.target.length, 1);
  assert.deepEqual(sql.target[0], {
    id: request.staffId,
    role: 'staff',
    tenant_id: expected.tenantId,
  });
  assert.equal(sql.audit.length, 1);
  const audit = sql.audit[0];
  assert.equal(audit.actor_id, expected.actorId);
  assert.equal(audit.tenant_id, expected.tenantId);
  assert.equal(audit.action, 'assign_owner');
  assert.equal(audit.entity_type, 'claim');
  assert.equal(audit.entity_id, request.claimId);
  assert.equal(audit.metadata.previousStaffId, null);
  assert.equal(audit.metadata.newStaffId, request.staffId);
  assert.equal(sql.result.length, 1);
  const ledger = sql.result[0];
  for (const [key, value] of Object.entries({
    operation_id: request.operationId,
    tenant_id: expected.tenantId,
    actor_id: expected.actorId,
    claim_id: request.claimId,
    command: request.command,
    version: 1,
  }))
    assert.equal(ledger[key], value);
  assert.equal(
    ledger.request_fingerprint,
    compiledDigest([
      1,
      request.command,
      expected.actorId,
      expected.tenantId,
      request.claimId,
      request.staffId,
    ])
  );
  assert.deepEqual(ledger.response, result.result);
  assert.deepEqual(sql.notifications, []);
  return Object.freeze({
    caseId: 'strict-ops-own-claim-success-and-sql-v1',
    profile: 'ops',
    outcome: 'completed',
    operationId: request.operationId,
    claimId: request.claimId,
    actorId: expected.actorId,
    tenantId: expected.tenantId,
    staffId: request.staffId,
    opsInstanceId: record.opsInstanceId,
    constructorName: contexts.constructorName,
    localQualificationOnly: false,
    loopbackQualification: false,
    requestDigest: context.requestDigest,
    responseDigest: context.responseDigest,
    runtimeOrdinal: 1,
    context: Object.freeze(context),
    sql: Object.freeze({
      claimRows: 1,
      auditRows: 1,
      ledgerRows: 1,
      notificationRows: 0,
      fingerprint: ledger.request_fingerprint,
      assignedAt: stamp,
    }),
  });
}
