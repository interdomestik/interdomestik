import assert from 'node:assert/strict';
// Pure validation after private channel termination; never a registration or acceptance API.
export function validateM4CompiledDriverCompletion(driver, sourceBefore, imageDigest) {
  assert.deepEqual(driver.sourceBookends, {
    before: sourceBefore,
    after: sourceBefore,
  });
  assert.equal(driver.imageDigest, imageDigest);
  const completion = driver.completion;
  assert.equal(completion.version, 1);
  assert.equal(completion.kind, 'owned-strict-compiled-execution');
  assert.equal(completion.observations.length, 4);
  assert.deepEqual(
    completion.observations.map(row => row.profile),
    ['legacy-admin', 'legacy-agent', 'staff', 'legacy-admin']
  );
  const ops = completion.strictOpsObservation,
    owner = completion.strictOwnerConstruction;
  assert.equal(ops.caseId, 'strict-ops-own-claim-success-and-sql-v1');
  assert.equal(ops.profile, 'ops');
  assert.equal(ops.outcome, 'completed');
  assert.equal(ops.constructorName, 'createM4PrivateAssignmentRuntime');
  assert.equal(ops.localQualificationOnly, false);
  assert.equal(ops.loopbackQualification, false);
  assert.equal(owner.constructorName, 'startM4PrivateAssignmentOwner');
  assert.equal(owner.localQualificationOnly, false);
  assert.equal(owner.loopbackQualification, false);
  assert.equal(owner.contexts.rows.length, 4);
  assert.equal(owner.transport.rows.length, 4);
  assert.notEqual(ops.opsInstanceId, owner.ownerInstanceId);
  assert.deepEqual(completion.cleanup, {
    complete: true,
    forcedTermination: false,
    remainingOwnedSessions: 0,
  });
  assert.equal(completion.runtimeAdmission, false);
  assert.equal(completion.nativeAdmission, false);
  assert.equal(completion.productionCCredit, 0);
  return completion;
}
