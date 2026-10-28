import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './db-access-m4-pairing-scheduling.fixture.mjs';

test('unit sequencing doubles: local SQL then closed compiled phase then historical/native workers', async () => {
  const f = await fixture();
  try {
    const result = f.api.executeM4Pairing(f.input);
    assert.deepEqual(f.calls, ['ordinary-run']);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.calls, [
      'ordinary-run',
      'runtime',
      'compiled',
      'loader-open',
      'start',
      'wait',
    ]);
    assert.ok(!f.calls.includes('native'));
    f.finish();
    const handle = await result;
    assert.deepEqual(f.calls, [
      'ordinary-run',
      'runtime',
      'compiled',
      'loader-open',
      'start',
      'wait',
      'native',
      'loader-finish',
      'close',
    ]);
    assert.ok(Object.isFrozen(handle));
    const projection = f.api.assertM4Pairing(handle, f.input);
    assert.deepEqual(projection.checkpoint.workerLoaderInspection, {
      scope: 'LOADER_ONLY_LOCAL',
      workers: 5,
    });
    assert.equal(f.calls.at(-1), 'compiled-bridge');
    assert.equal(f.calls.filter(value => value === 'compiled-take').length, 1);
    assert.equal(f.calls.filter(value => value === 'loader-assert').length, 1);
    assert.equal(f.calls.filter(value => value === 'ordinary-take').length, 1);
    assert.deepEqual(projection.checkpoint.nativeConstructionData.report, { rows: [] });
    assert.equal(projection.checkpoint.nativeConstructionData.sourcePolicyDigest, 'source-policy');
    assert.equal(f.diagnosticOwner.has(f.diagnosticToken), true);
    assert.deepEqual(
      projection.checkpoint.nativeConstructionData.diagnosticToken,
      f.diagnosticToken
    );
    assert.equal(
      f.diagnosticOwner.has(projection.checkpoint.nativeConstructionData.diagnosticToken),
      false
    );
  } finally {
    f.cleanup();
  }
});
test('unit sequencing doubles: ordinary prerequisite failure starts no loader or worker', async () => {
  const f = await fixture('ordinary');
  try {
    await assert.rejects(f.api.executeM4Pairing(f.input), /ordinary failed/u);
    assert.deepEqual(f.calls, ['ordinary-run']);
  } finally {
    f.cleanup();
  }
});
for (const failure of ['runtime', 'compiled', 'wait', 'native'])
  test(`unit sequencing doubles: ${failure} failure retires only phases actually started`, async () => {
    const f = await fixture(failure);
    try {
      const result = f.api.executeM4Pairing(f.input);
      if (failure === 'wait') f.refuse(Error('wait failed'));
      else f.finish();
      await assert.rejects(result, new RegExp(failure + ' failed', 'u'));
      const started = failure === 'wait' || failure === 'native';
      if (started) assert.equal(f.calls.at(-1), 'loader-abort');
      else assert(!f.calls.includes('loader-open'));
      assert.equal(f.calls.filter(value => value === 'close').length, started ? 1 : 0);
      assert.equal(f.calls.filter(value => value === 'loader-abort').length, started ? 1 : 0);
      if (failure !== 'native') assert.ok(!f.calls.includes('native'));
    } finally {
      f.cleanup();
    }
  });
test('unit sequencing doubles: foreign policy is refused before starting any worker', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.api.executeM4Pairing({ ...f.input, policy: {} }), /foreign policy/u);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

for (const [name, change] of [
  ['missing compiled conjunction', p => delete p.boundedCompiledConstructionQualified],
  [
    'false compiled construction',
    p => (p.compiledConstruction.scopedConstructionQualified = false),
  ],
  ['missing local qualification scope', p => delete p.construction.localQualificationOnly],
  ['false live ingress qualification', p => (p.construction.nextActionIngressQualified = true)],
  ['absent proof class', p => (p.construction.currentProofClassQualified = false)],
  ['legacy class substituted', p => (p.construction.kind = 'old-two-factories')],
  ['empty mounted decision list', p => (p.mountedAssignment.localDecisions.length = 0)],
  ['one missing mounted profile', p => p.mountedAssignment.localDecisions.pop()],
  [
    'replayed mounted case',
    p =>
      (p.mountedAssignment.localDecisions[1].executedRoutes[0].caseId =
        p.mountedAssignment.localDecisions[0].executedRoutes[0].caseId),
  ],
  [
    'unsupported production claim',
    p => (p.mountedAssignment.localDecisions[0].nextDeploymentQualified = true),
  ],
])
  test(
    'unit sequencing doubles: ' + name + ' refuses after one private ordinary take',
    async () => {
      const f = await fixture();
      try {
        const running = f.api.executeM4Pairing(f.input);
        f.finish();
        const handle = await running;
        change(f.privateAcceptance);
        assert.throws(
          () => f.api.assertM4Pairing(handle, f.input),
          /semantic missing current mounted/u
        );
        assert.equal(f.calls.filter(value => value === 'ordinary-take').length, 1);
        assert.throws(() => f.api.assertM4Pairing(handle, f.input), /already consumed/u);
      } finally {
        f.cleanup();
      }
    }
  );

test('unit private pair: cloned handle refuses; compiled semantic refusal burns the one-use pair', async () => {
  const f = await fixture('bridge');
  try {
    const running = f.api.executeM4Pairing(f.input);
    f.finish();
    const handle = await running;
    assert.throws(() => f.api.assertM4Pairing(structuredClone(handle), f.input), /foreign handle/);
    assert.throws(() => f.api.assertM4Pairing(handle, f.input), /compiled correspondence failed/);
    assert.equal(f.calls.filter(value => value === 'ordinary-take').length, 1);
    assert.equal(f.calls.filter(value => value === 'compiled-take').length, 1);
    assert.throws(() => f.api.assertM4Pairing(handle, f.input), /already consumed/);
  } finally {
    f.cleanup();
  }
});
