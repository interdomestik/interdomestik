import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { executeM4CompiledDriver } from './db-access-m4-compiled-driver-channel.mjs';
import { validateM4CompiledDriverCompletion } from './db-access-m4-compiled-completion.mjs';
import { persistM4CompiledReview } from './db-access-m4-compiled-persist.mjs';
import { createM4CompiledLayout } from './db-access-m4-compiled-layout.mjs';
import {
  isFreshM4CompiledRuntimeResult,
  assertM4CompiledInvocation,
} from './db-access-m4-compiled-producer-loader.mjs';
function result() {
  return {
    sourceBookends: {
      before: { candidate: 'c', producer: 'p' },
      after: { candidate: 'c', producer: 'p' },
    },
    imageDigest: 'i',
    completion: {
      version: 1,
      kind: 'owned-strict-compiled-execution',
      observations: ['legacy-admin', 'legacy-agent', 'staff', 'legacy-admin'].map(profile => ({
        profile,
      })),
      strictOpsObservation: {
        caseId: 'strict-ops-own-claim-success-and-sql-v1',
        profile: 'ops',
        outcome: 'completed',
        constructorName: 'createM4PrivateAssignmentRuntime',
        localQualificationOnly: false,
        loopbackQualification: false,
        opsInstanceId: 'ops',
      },
      strictOwnerConstruction: {
        constructorName: 'startM4PrivateAssignmentOwner',
        localQualificationOnly: false,
        loopbackQualification: false,
        ownerInstanceId: 'owner',
        contexts: { rows: [1, 2, 3, 4] },
        transport: { rows: [1, 2, 3, 4] },
      },
      cleanup: {
        complete: true,
        forcedTermination: false,
        remainingOwnedSessions: 0,
      },
      runtimeAdmission: false,
      nativeAdmission: false,
      productionCCredit: 0,
    },
  };
}
async function channel(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-channel-'));
  try {
    fs.copyFileSync(
      new URL('./db-access-m4-compiled-channel.fixture.mjs', import.meta.url),
      path.join(root, 'db-access-m4-compiled-driver.mjs')
    );
    return await executeM4CompiledDriver({
      root,
      input: { mode, result: result() },
      deadlineAt: performance.now() + 2000,
    });
  } finally {
    fs.rmSync(root, { recursive: true });
  }
}
test('dedicated actual process channel finishes only after complete, explicit close, disconnect and zero exit', async () => {
  const actual = await channel('normal');
  assert.deepEqual(actual, result());
  assert.equal(isFreshM4CompiledRuntimeResult(actual), false); // Channel-model success is never runtime provenance.
});
for (const mode of [
  'wrong-pid',
  'wrong-nonce',
  'early',
  'duplicate',
  'missing-close',
  'stdout',
  'file',
  'cross-channel',
])
  test('private completion refuses actual peer spoof: ' + mode, async () => {
    await assert.rejects(channel(mode));
  });
for (const [name, mutate] of [
  ['missing strict ops', r => delete r.completion.strictOpsObservation],
  ['local ops substituted', r => (r.completion.strictOpsObservation.localQualificationOnly = true)],
  [
    'owner instance reused for ops',
    r => (r.completion.strictOpsObservation.opsInstanceId = 'owner'),
  ],
  ['source changed', r => (r.sourceBookends.after.candidate = 'changed')],
  ['producer changed', r => (r.sourceBookends.after.producer = 'changed')],
  ['image changed', r => (r.imageDigest = 'changed')],
  ['cleanup missing', r => (r.completion.cleanup.complete = false)],
  ['forced cleanup', r => (r.completion.cleanup.forcedTermination = true)],
  ['owned session remains', r => (r.completion.cleanup.remainingOwnedSessions = 1)],
])
  test('post-channel comparison refuses ' + name, () => {
    const data = result();
    mutate(data);
    assert.throws(() =>
      validateM4CompiledDriverCompletion(data, { candidate: 'c', producer: 'p' }, 'i')
    );
  });
test('raw runtime import and cloned invocation admission refuse before policy/application imports', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(new URL('./db-access-m4-compiled-runtime.mjs', import.meta.url).href)})`,
    ],
    { encoding: 'utf8', timeout: 3000 }
  );
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /requires actual protected producer admission/);
  for (const token of [
    {},
    Object.freeze({ authenticated: true }),
    { sourceCommit: 'a'.repeat(40) },
  ])
    assert.throws(() => assertM4CompiledInvocation(token, 'x', 'y', {}));
});
test('review persistence is exclusive private output and never input authority', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-review-')));
  try {
    const assembly = path.join(root, 'assembly');
    fs.mkdirSync(assembly, { mode: 0o700 });
    const file = persistM4CompiledReview(root, assembly, {
      checksPassed: true,
    });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.equal(isFreshM4CompiledRuntimeResult(JSON.parse(fs.readFileSync(file))), false);
    assert.throws(() => persistM4CompiledReview(assembly, assembly, {}), /overlap/);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test('Next cache/logs/browser writes and driver evidence receive distinct fresh paths', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-layout-')));
  try {
    const work = path.join(root, 'work'),
      backend = path.join(root, 'backend');
    fs.mkdirSync(work, { mode: 0o700 });
    fs.mkdirSync(backend, { mode: 0o700 });
    const layout = createM4CompiledLayout(work, backend);
    assert.equal(new Set(Object.values(layout)).size, 8);
    assert(Object.isFrozen(layout));
    assert.throws(() => createM4CompiledLayout(work, backend), /fresh/);
    assert.throws(() => createM4CompiledLayout(backend, backend), /overlap/);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
