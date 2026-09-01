import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeRehearsalManifest } from './slice-rehearse-init.mjs';
import { validateRehearsalManifest } from './slice-rehearse-core.mjs';

const SHA = character => character.repeat(40);
const INIT = 'scripts/slice-rehearse-init.mjs';
const TEST = 'scripts/slice-rehearse-init.test.mjs';
const PROMOTION = [
  'docs/plans/2026-08-28-t117b-cutover-admission.json',
  'docs/plans/2026-08-28-t117b-cutover-design-gate.md',
  'docs/plans/current-program.md',
  'docs/plans/current-tracker.md',
];

const request = (overrides = {}) => ({
  sliceId: 'HARNESS-V2-1',
  tier: 3,
  workClass: 'governance',
  writerPaths: [INIT, TEST],
  proofCommands: [`node --test ${TEST}`],
  heavyLanes: ['pr-e2e'],
  routineOperations: ['rerun_invalidated_proof'],
  ...overrides,
});

const facts = (overrides = {}) => ({
  baseSha: SHA('a'),
  origin: 'https://github.com/interdomestik/interdomestik.git',
  existingPaths: [],
  workflowDigest: 'b'.repeat(64),
  substrateDigest: 'c'.repeat(64),
  existingCapacityCapsByPath: {},
  capacityDeltasByPath: {
    [INIT]: 0,
    [TEST]: 0,
  },
  authority: {
    source: 'live-resolver',
    runtimeAuthorized: false,
    activeSlice: null,
  },
  ...overrides,
});

test('uses exact path capacity', () => {
  const manifest = initializeRehearsalManifest(
    request(),
    facts({
      existingCapacityCapsByPath: {
        [INIT]: 321,
      },
      capacityDeltasByPath: {
        [INIT]: 123,
        [TEST]: 456,
      },
    })
  );
  assert.deepEqual(
    manifest.pathPlans.map(plan => plan.maxBytesDelta),
    [321, 456]
  );
});

test('creates canonical governance', () => {
  const first = initializeRehearsalManifest(request(), facts());
  const second = initializeRehearsalManifest(
    request({ writerPaths: [...request().writerPaths].reverse() }),
    facts()
  );

  assert.deepEqual(first, second);
  assert.deepEqual(validateRehearsalManifest(first), first);
  assert.equal(first.authorityGranted, undefined);
  assert.deepEqual(
    first.pathPlans.map(plan => [plan.change, plan.maxLines]),
    [
      ['create', 300],
      ['create', 300],
    ]
  );
});

test('product requires runtime authority', () => {
  assert.throws(
    () => initializeRehearsalManifest(request({ workClass: 'product' }), facts()),
    /live runtime authority does not grant HARNESS-V2-1/u
  );
});

test('separates governance owner', () => {
  const manifest = initializeRehearsalManifest(
    request({ capacityOwnerId: 'harness-v2-efficiency' }),
    facts()
  );
  assert.equal(manifest.capacityOwnerId, 'harness-v2-efficiency');
  assert.deepEqual(validateRehearsalManifest(manifest), manifest);
});

test('initializes promotion owner reuse', () => {
  const manifest = initializeRehearsalManifest(
    request({
      sliceId: 'T117B-CUTOVER',
      capacityOwnerId: 't117b-cutover',
      writerPaths: PROMOTION,
      topology: {
        closeoutMode: 'promotion',
        projectionPaths: PROMOTION,
        repairAllocationId: null,
        repairPaths: [],
      },
    }),
    facts({
      existingPaths: PROMOTION,
      capacityDeltasByPath: Object.fromEntries(PROMOTION.map(path => [path, 0])),
    })
  );
  const { capacityOwnerId: _owner, workClass: _kind, ...v1 } = manifest;
  for (const invalid of [
    { ...v1, schemaVersion: 1 },
    { ...manifest, sliceId: 'UNPROMOTED', capacityOwnerId: 'unpromoted' },
  ]) {
    assert.throws(() => validateRehearsalManifest(invalid), /promotion mismatch/u);
  }
});

test('consolidates missing input errors', () => {
  assert.throws(
    () =>
      initializeRehearsalManifest(
        request({ sliceId: '', writerPaths: [], proofCommands: [], heavyLanes: [] }),
        facts({ workflowDigest: null, substrateDigest: null })
      ),
    /heavyLanes.*proofCommands.*sliceId.*substrateDigest.*workflowDigest.*writerPaths/u
  );
});
