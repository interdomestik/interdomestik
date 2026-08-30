import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSliceOwnedCleanup, validateCleanupEnvelope } from './slice-rehearse-cleanup.mjs';

const inactive = { source: 'live-resolver', runtimeAuthorized: false, activeSlice: null };

test('derives only slice-owned cleanup by default', () => {
  const plan = deriveSliceOwnedCleanup({
    taskId: 'HARNESS-V2-1',
    authority: inactive,
    artifacts: [
      {
        path: '/private/tmp/harness-v2-1',
        exists: true,
        ownerTaskId: 'HARNESS-V2-1',
        safeToDiscard: true,
      },
    ],
  });
  assert.equal(plan.mode, 'slice_owned');
  assert.deepEqual(plan.artifactPaths, ['/private/tmp/harness-v2-1']);
  assert.equal(plan.approvalEnvelopeId, null);
});

test('global hygiene requires a separate explicit, recoverable envelope', () => {
  const global = {
    schemaVersion: 1,
    mode: 'global_hygiene',
    taskId: 'HARNESS-V2-1',
    artifactPaths: ['/private/tmp/stale-worktree'],
    approvalEnvelopeId: 'HARNESS-V2-1-GLOBAL-HYGIENE-1',
    recoveryBundlePath: '/private/tmp/harness-v2-1-recovery.bundle',
    separatelyAuthorized: true,
  };
  assert.deepEqual(validateCleanupEnvelope(global, inactive), global);
  assert.throws(
    () => validateCleanupEnvelope({ ...global, separatelyAuthorized: false }, inactive),
    /separate explicit authorization/u
  );
  assert.throws(
    () => validateCleanupEnvelope({ ...global, recoveryBundlePath: null }, inactive),
    /recoverable/u
  );
});

test('cleanup always fails closed on cached or active authority', () => {
  assert.throws(
    () =>
      deriveSliceOwnedCleanup({
        taskId: 'HARNESS-V2-1',
        authority: { ...inactive, source: 'cache' },
        artifacts: [],
      }),
    /live inactive authority/u
  );
  assert.throws(
    () => validateCleanupEnvelope({ schemaVersion: 1 }, { ...inactive, runtimeAuthorized: true }),
    /live inactive authority/u
  );
});
