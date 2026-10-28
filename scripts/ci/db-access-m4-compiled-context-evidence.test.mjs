import test from 'node:test';
import assert from 'node:assert/strict';
import { executionFixture } from './db-access-m4-compiled-context.fixture.mjs';
import { relateCompiledExecutedContexts } from './db-access-m4-compiled-context-evidence.mjs';
test('actual strict web3 plus denial and separate successful ops link all mandatory SQL witnesses', () => {
  const f = executionFixture(),
    before = JSON.stringify(f),
    result = relateCompiledExecutedContexts(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.constructions.length, 4);
  assert.deepEqual(
    result.constructions.map(row => row.profile),
    ['legacy-admin', 'legacy-agent', 'staff', 'ops']
  );
  assert(result.assertions.length > 0);
});
const executionMutants = {
  'Next and backend are distinct images': f =>
    (f.compiled.completion.platformEvidence.sourceInputs['app/actions.js'].sha256 = 'b'.repeat(64)),
  'missing Next source input': f =>
    delete f.compiled.completion.platformEvidence.sourceInputs['app/actions.js'],

  'missing strict ops SQL row': f => (f.compiled.completion.strictOpsObservation.sql.claimRows = 0),
  'wrong strict ops actor fingerprint': f =>
    (f.compiled.completion.strictOpsObservation.actorId = 'foreign'),
  'wrong strict ops case': f => (f.compiled.completion.strictOpsObservation.caseId = 'local-case'),
  'no successful strict ops': f => delete f.compiled.completion.strictOpsObservation,
  'denial is not successful ops': f =>
    (f.compiled.completion.strictOpsObservation.outcome = 'denied'),
  'local constructor not strict': f =>
    (f.compiled.completion.strictOwnerConstruction.localQualificationOnly = true),
  'foreign event': f => (f.compiled.contextSha256 = 'b'.repeat(64)),
  'foreign policy': f => (f.compiled.policySha256 = 'b'.repeat(64)),
  'foreign native/executed source': f => (f.imageRecords['a.ts'].sha256 = 'b'.repeat(64)),
  'unclosed platform': f => (f.compiled.completion.platformEvidence.cleanup.drained = false),
  'changed image': f =>
    (f.compiled.completion.platformEvidence.sourceImageBookends.after.image = 'b'.repeat(64)),
  'wrong compiled action': f =>
    (f.compiled.completion.observations[0].frameworkActionId = 'foreign'),
  'missing browser case': f => f.compiled.completion.platformEvidence.reporter.cases.pop(),
  'duplicate browser case': f =>
    (f.compiled.completion.platformEvidence.reporter.cases[1].title = 'a'),
  'unsettled transport': f =>
    (f.compiled.completion.strictOwnerConstruction.transport.rows[0].responseDigest = null),
  'wrong actual receiver': f =>
    (f.compiled.completion.strictOwnerConstruction.contexts.rows[0].receiver = 'mock'),
  'posture was not checked': f =>
    (f.compiled.completion.strictOpsObservation.context.capturedAfterPosture = false),
  'same instance is not separate ops construction': f =>
    (f.compiled.completion.strictOpsObservation.opsInstanceId = 'actual-owner-instance'),
  'missing mandatory assertion': f => (f.effectAssertions.fixedOracleLinks[0].assertions = []),
  'unexecuted assertion case': f => (f.runtime.completion.profileCaseIds = []),
  'wrong profile source class': f =>
    (f.effectAssertions.assignmentContextProof.profiles[0].profile = 'foreign'),
  'false global loader upgrade': f => (f.workerLoaderInspection.sourceDataReadsQualified = true),
  'missing worker': f => (f.workerLoaderInspection.cardinality.workers = 4),
};
for (const [name, mutate] of Object.entries(executionMutants))
  test(name, () => {
    const f = executionFixture();
    mutate(f);
    assert.throws(
      () => relateCompiledExecutedContexts(f),
      /M4 compiled context correspondence refused/
    );
  });
