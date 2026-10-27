import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMountedAssignmentProofConstruction } from './db-access-m4-mounted-p2-proof.mjs';
import { mountedP2ExecutionFixture } from './db-access-m4-mounted-p2-proof.fixture.mjs';
test('exact current unit class has ten retained cases and zero historical/native admission', () => {
  const data = mountedP2ExecutionFixture(),
    before = JSON.stringify(data);
  const result = deriveMountedAssignmentProofConstruction(data);
  assert.equal(result.currentProofClassQualified, true);
  assert.equal(result.dataOnly, true);
  assert.equal(result.exactCaseCount, 10);
  assert.equal(result.mockSpecifiers.length, 2);
  assert.equal(Object.keys(result.sourceFiles).length, 3);
  assert.equal(result.historicalFactoryTransitions.length, 2);
  assert(
    result.historicalFactoryTransitions.every(
      row =>
        row.currentSourceFactoryCallbacksAbsent === true &&
        row.currentNativeIdentityAccepted === false
    )
  );
  assert.equal(result.acceptedOldIdentityCount, 0);
  assert.equal(result.nativeAdmission, false);
  assert.equal(result.runtimeAdmission, false);
  assert.equal(result.actualP2FreshOwnerRequired, true);
  assert.equal(JSON.stringify(data), before);
  assert(Object.isFrozen(result.historicalFactoryTransitions[0]));
});
for (const [name, mutate] of [
  ['changed current source', x => (x.sources.originalTest.text += '\n// drift')],
  ['forged source digest', x => (x.sources.originalRelay.sha256 = 'f'.repeat(64))],
  [
    'actual SDK authority instead of projection',
    x => (x.sources.generatedRelayJs.text = x.sources.originalRelay.text),
  ],
  ['missing source image', x => delete x.sources.generatedWrapperTs],
  ['foreign source image', x => (x.sources.foreign = x.sources.originalTest)],
  ['missing retained statement', x => x.retainedSegments.pop()],
  ['failed actual case', x => (x.actualCases[0].state = 'fail')],
  ['missing actual case', x => x.actualCases.pop()],
  ['duplicate actual case', x => (x.actualCases[1] = x.actualCases[0])],
  ['wrong suite', x => (x.actualSuites[1].name = 'prior suite')],
  ['ambient test overlap', x => x.ordinaryPartition.ambient.push(x.ordinaryPartition.capsule[0])],
  ['extra mocked module', x => x.mockSpecifiers.push('@interdomestik/database')],
  ['missing mandatory assertion metadata', x => x.tests.pop()],
  ['direct factory V8 claim', x => (x.directFactoryCoverageObserved = true)],
  ['wrong compiler', x => (x.compilerVersion = 'unknown')],
  ['projection claims full SDK', x => (x.actualExportProjection.scope = 'full-sdk')],
])
  test(name + ' refuses the fixed current construction', () => {
    const data = mountedP2ExecutionFixture();
    mutate(data);
    assert.throws(
      () => deriveMountedAssignmentProofConstruction(data),
      /M4 mounted P2 construction refused/u
    );
  });
