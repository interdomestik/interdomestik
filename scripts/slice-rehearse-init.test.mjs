import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeRehearsalManifest } from './slice-rehearse-init.mjs';
import { validateRehearsalManifest } from './slice-rehearse-core.mjs';

const SHA = character => character.repeat(40);

function request(overrides = {}) {
  return {
    schemaVersion: 1,
    sliceId: 'HARNESS-V2-1',
    tier: 3,
    workClass: 'governance',
    writerPaths: ['scripts/slice-rehearse-init.mjs', 'scripts/slice-rehearse-init.test.mjs'],
    proofCommands: ['node --test scripts/slice-rehearse-init.test.mjs'],
    heavyLanes: ['pr-e2e'],
    routineOperations: ['rerun_invalidated_proof'],
    ...overrides,
  };
}

function facts(overrides = {}) {
  return {
    baseSha: SHA('a'),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    existingPaths: [],
    workflowDigest: 'b'.repeat(64),
    substrateDigest: 'c'.repeat(64),
    authority: {
      source: 'live-resolver',
      runtimeAuthorized: false,
      activeSlice: null,
    },
    ...overrides,
  };
}

test('first normal invocation produces a canonical schema-valid governance manifest', () => {
  const first = initializeRehearsalManifest(request(), facts());
  const second = initializeRehearsalManifest(
    request({ writerPaths: [...request().writerPaths].reverse() }),
    facts()
  );

  assert.deepEqual(first, second);
  assert.deepEqual(validateRehearsalManifest(first), first);
  assert.equal(first.authorityGranted, undefined);
  assert.deepEqual(
    first.pathPlans.map(plan => plan.change),
    ['create', 'create']
  );
  assert.deepEqual(
    first.pathPlans.map(plan => plan.maxLines),
    [300, 300]
  );
});

test('product initialization fails closed when live runtime authority does not match', () => {
  assert.throws(
    () => initializeRehearsalManifest(request({ workClass: 'product' }), facts()),
    /live runtime authority does not grant HARNESS-V2-1/u
  );
});

test('separates a governance delivery identity from its explicit existing capacity owner', () => {
  const manifest = initializeRehearsalManifest(
    request({ capacityOwnerId: 'harness-v2-efficiency' }),
    facts()
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.sliceId, 'HARNESS-V2-1');
  assert.equal(manifest.workClass, 'governance');
  assert.equal(manifest.capacityOwnerId, 'harness-v2-efficiency');
  assert.deepEqual(validateRehearsalManifest(manifest), manifest);
});

test('reports all genuine missing inputs in one consolidated error', () => {
  assert.throws(
    () =>
      initializeRehearsalManifest(
        request({ sliceId: '', writerPaths: [], proofCommands: [], heavyLanes: [] }),
        facts({ workflowDigest: null, substrateDigest: null })
      ),
    error => {
      assert.match(error.message, /sliceId/u);
      assert.match(error.message, /writerPaths/u);
      assert.match(error.message, /proofCommands/u);
      assert.match(error.message, /heavyLanes/u);
      assert.match(error.message, /workflowDigest/u);
      assert.match(error.message, /substrateDigest/u);
      return true;
    }
  );
});
