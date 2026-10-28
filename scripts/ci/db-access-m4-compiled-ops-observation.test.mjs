import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledDigest } from './db-access-m4-compiled-observations.mjs';
import { validateM4StrictOps } from './db-access-m4-compiled-ops-observation.mjs';
const op = '11111111-1111-4111-8111-111111111111';
const instance = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const request = {
    version: 1,
    command: 'm4.ops.assign-owner',
    operationId: op,
    claimId: 'own',
    staffId: 'staff',
  };
  const stamp = '2026-10-28T12:00:00.000Z';
  const result = {
    status: 'completed',
    operationId: op,
    replayed: false,
    result: {
      success: true,
      data: { id: 'own', staffId: 'staff', assignedAt: stamp },
    },
  };
  const context = {
    ordinal: 1,
    profile: 'ops',
    receiver: 'posture-checked-owned-data-drizzle',
    verifier: 'owned-current-store-identity-drizzle',
    configurationIdentityChecked: true,
    capturedAfterPosture: true,
    operationId: op,
    requestDigest: compiledDigest(request),
    responseDigest: compiledDigest(result),
  };
  return {
    request,
    expected: { actorId: 'actor', tenantId: 'tenant' },
    ownerInstanceId: '33333333-3333-4333-8333-333333333333',
    record: {
      opsInstanceId: instance,
      result,
      contexts: {
        version: 1,
        constructorName: 'createM4PrivateAssignmentRuntime',
        localQualificationOnly: false,
        loopbackQualification: false,
        rows: [context],
      },
    },
    sql: {
      claim: [
        {
          id: 'own',
          tenant_id: 'tenant',
          staffId: 'staff',
          assignedById: 'actor',
          assignedAt: stamp,
        },
      ],
      target: [{ id: 'staff', role: 'staff', tenant_id: 'tenant' }],
      audit: [
        {
          actor_id: 'actor',
          tenant_id: 'tenant',
          action: 'assign_owner',
          entity_type: 'claim',
          entity_id: 'own',
          metadata: { previousStaffId: null, newStaffId: 'staff' },
        },
      ],
      result: [
        {
          operation_id: op,
          tenant_id: 'tenant',
          actor_id: 'actor',
          claim_id: 'own',
          command: request.command,
          version: 1,
          request_fingerprint: compiledDigest([
            1,
            request.command,
            'actor',
            'tenant',
            'own',
            'staff',
          ]),
          response: result.result,
        },
      ],
      notifications: [],
    },
  };
}
test('separate strict ops comparison binds constructor, request/result and independent SQL', () => {
  const result = validateM4StrictOps(fixture());
  assert.equal(result.caseId, 'strict-ops-own-claim-success-and-sql-v1');
  assert.equal(result.opsInstanceId, instance);
  assert(Object.isFrozen(result));
});
for (const [name, change] of [
  ['local constructor', v => (v.record.contexts.localQualificationOnly = true)],
  [
    'wrong constructor',
    v => (v.record.contexts.constructorName = 'createM4LocalQualificationRuntime'),
  ],
  ['loopback qualification', v => (v.record.contexts.loopbackQualification = true)],
  ['owner instance relabel', v => (v.record.opsInstanceId = v.ownerInstanceId)],
  ['no strict capture', v => (v.record.contexts.rows = [])],
  ['web capture relabel', v => (v.record.contexts.rows[0].profile = 'legacy-admin')],
  ['stale request', v => (v.record.contexts.rows[0].requestDigest = '0'.repeat(64))],
  ['stale result', v => (v.record.contexts.rows[0].responseDigest = '0'.repeat(64))],
  ['unclosed response', v => (v.record.result.status = 'indeterminate')],
  ['replay', v => (v.record.result.replayed = true)],
  ['missing audit', v => (v.sql.audit = [])],
  ['wrong current staff role', v => (v.sql.target[0].role = 'agent')],
  ['wrong tenant', v => (v.sql.claim[0].tenant_id = 'foreign')],
  ['missing ledger', v => (v.sql.result = [])],
  ['wrong operation binding', v => (v.sql.result[0].operation_id = instance)],
  ['stale fingerprint', v => (v.sql.result[0].request_fingerprint = '0'.repeat(64))],
  ['other response', v => (v.sql.result[0].response = { success: false })],
  ['unexpected notification', v => (v.sql.notifications = [{ id: 'unexpected' }])],
])
  test('strict ops comparison refuses ' + name, () => {
    const value = fixture();
    change(value);
    assert.throws(() => validateM4StrictOps(value));
  });
