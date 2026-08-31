import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import {
  deriveSliceOwnedCleanup,
  validateCleanupEnvelope,
  verifyCleanupTargetsImmediatelyBeforeDeletion,
} from './slice-rehearse-cleanup.mjs';

const inactive = { source: 'live-resolver', runtimeAuthorized: false, activeSlice: null };

test('derives only slice-owned cleanup by default', () => {
  const plan = deriveSliceOwnedCleanup({
    taskId: 'HARNESS-V2-1',
    authority: inactive,
    registry: [
      {
        path: '/private/tmp/harness-v2-1',
        ownerTaskId: 'HARNESS-V2-1',
        safeToDiscard: true,
        realPath: '/private/tmp/harness-v2-1',
        type: 'directory',
        device: '1',
        inode: '2',
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
    targetIdentities: {
      '/private/tmp/stale-worktree': {
        realPath: '/private/tmp/stale-worktree',
        type: 'directory',
        device: '1',
        inode: '2',
      },
    },
    approvalEnvelopeId: 'HARNESS-V2-1-GLOBAL-HYGIENE-1',
    recoveryBundlePath: '/private/tmp/harness-v2-1-recovery.bundle',
    recoveryBundleIdentity: {
      realPath: '/private/tmp/harness-v2-1-recovery.bundle',
      type: 'file',
      device: '1',
      inode: '3',
    },
    recoveryBundleSha256: 'a'.repeat(64),
    approvalBindingSha256: '',
    separatelyAuthorized: true,
  };
  global.approvalBindingSha256 = sha256(
    canonicalJson({
      approvalEnvelopeId: global.approvalEnvelopeId,
      artifactPaths: global.artifactPaths,
      recoveryBundlePath: global.recoveryBundlePath,
      recoveryBundleIdentity: global.recoveryBundleIdentity,
      recoveryBundleSha256: global.recoveryBundleSha256,
      taskId: global.taskId,
    })
  );
  assert.deepEqual(validateCleanupEnvelope(global, inactive), global);
  assert.throws(
    () => validateCleanupEnvelope({ ...global, separatelyAuthorized: false }, inactive),
    /separate explicit authorization/u
  );
  assert.throws(
    () => validateCleanupEnvelope({ ...global, recoveryBundlePath: null }, inactive),
    /recoverable/u
  );
  assert.throws(
    () =>
      validateCleanupEnvelope(
        {
          ...global,
          artifactPaths: ['/private/tmp/stale-worktree'],
          recoveryBundlePath: '/private/tmp/stale-worktree/recovery.bundle',
          recoveryBundleIdentity: {
            ...global.recoveryBundleIdentity,
            realPath: '/private/tmp/stale-worktree/recovery.bundle',
          },
        },
        inactive
      ),
    /overlap cleanup targets/u
  );
});

test('cleanup always fails closed on cached or active authority', () => {
  assert.throws(
    () =>
      deriveSliceOwnedCleanup({
        taskId: 'HARNESS-V2-1',
        authority: { ...inactive, source: 'cache' },
        registry: [],
      }),
    /live inactive authority/u
  );
  assert.throws(
    () => validateCleanupEnvelope({ schemaVersion: 1 }, { ...inactive, runtimeAuthorized: true }),
    /live inactive authority/u
  );
});

test('revalidates realpath, type, device, and inode immediately before deletion', () => {
  const plan = deriveSliceOwnedCleanup({
    taskId: 'HARNESS-V2-1',
    authority: inactive,
    registry: [
      {
        path: '/private/tmp/harness-v2-1',
        ownerTaskId: 'HARNESS-V2-1',
        safeToDiscard: true,
        realPath: '/private/tmp/harness-v2-1',
        type: 'directory',
        device: '1',
        inode: '2',
      },
    ],
  });
  assert.equal(
    verifyCleanupTargetsImmediatelyBeforeDeletion(plan, {
      inspect: () => ({
        realPath: '/private/tmp/harness-v2-1',
        type: 'directory',
        device: '1',
        inode: '2',
      }),
    }),
    true
  );
  assert.throws(
    () =>
      verifyCleanupTargetsImmediatelyBeforeDeletion(plan, {
        inspect: () => ({
          realPath: '/private/tmp/harness-v2-1',
          type: 'directory',
          device: '1',
          inode: '99',
        }),
      }),
    /identity changed/u
  );
});

test('revalidates the recovery bundle identity and digest before global deletion', () => {
  const global = {
    schemaVersion: 1,
    mode: 'global_hygiene',
    taskId: 'HARNESS-V2-1',
    artifactPaths: ['/private/tmp/stale-worktree'],
    targetIdentities: {
      '/private/tmp/stale-worktree': {
        realPath: '/private/tmp/stale-worktree',
        type: 'directory',
        device: '1',
        inode: '2',
      },
    },
    approvalEnvelopeId: 'HARNESS-V2-1-GLOBAL-HYGIENE-1',
    recoveryBundlePath: '/private/tmp/harness-v2-1-recovery.bundle',
    recoveryBundleIdentity: {
      realPath: '/private/tmp/harness-v2-1-recovery.bundle',
      type: 'file',
      device: '1',
      inode: '3',
    },
    recoveryBundleSha256: 'a'.repeat(64),
    approvalBindingSha256: '',
    separatelyAuthorized: true,
  };
  global.approvalBindingSha256 = sha256(
    canonicalJson({
      approvalEnvelopeId: global.approvalEnvelopeId,
      artifactPaths: global.artifactPaths,
      recoveryBundlePath: global.recoveryBundlePath,
      recoveryBundleIdentity: global.recoveryBundleIdentity,
      recoveryBundleSha256: global.recoveryBundleSha256,
      taskId: global.taskId,
    })
  );
  const envelope = validateCleanupEnvelope(global, inactive);
  const identities = {
    '/private/tmp/stale-worktree': global.targetIdentities['/private/tmp/stale-worktree'],
    '/private/tmp/harness-v2-1-recovery.bundle': global.recoveryBundleIdentity,
  };
  assert.equal(
    verifyCleanupTargetsImmediatelyBeforeDeletion(envelope, {
      inspect: path => identities[path],
      digest: () => 'a'.repeat(64),
    }),
    true
  );
  assert.throws(
    () =>
      verifyCleanupTargetsImmediatelyBeforeDeletion(envelope, {
        inspect: path => identities[path],
        digest: () => 'b'.repeat(64),
      }),
    /recovery bundle digest changed/u
  );
});

test('the production cleanup entry point derives slice ownership and revalidates before removal', async () => {
  const cleanup = await import('./slice-rehearse-cleanup.mjs');
  assert.equal(typeof cleanup.executeCleanupRequest, 'function');
  const calls = [];
  const artifact = {
    path: '/private/tmp/harness-v2-1-owned',
    ownerTaskId: 'HARNESS-V2-1',
    safeToDiscard: true,
    realPath: '/private/tmp/harness-v2-1-owned',
    type: 'directory',
    device: '1',
    inode: '2',
  };
  const result = cleanup.executeCleanupRequest(
    {
      schemaVersion: 1,
      mode: 'slice_owned',
      taskId: 'HARNESS-V2-1',
      artifactPaths: [artifact.path],
    },
    {
      readAuthority: () => {
        calls.push('authority');
        return inactive;
      },
      readRegistry: () => {
        calls.push('registry');
        return [artifact];
      },
      inspect: () => {
        calls.push('inspect');
        return {
          realPath: artifact.realPath,
          type: artifact.type,
          device: artifact.device,
          inode: artifact.inode,
        };
      },
      remove: (path, type) => calls.push(`remove:${type}:${path}`),
    }
  );
  assert.deepEqual(calls, [
    'authority',
    'registry',
    'inspect',
    `remove:directory:${artifact.path}`,
  ]);
  assert.deepEqual(result, {
    mode: 'slice_owned',
    removed: [artifact.path],
    taskId: 'HARNESS-V2-1',
  });
});

test('package exposes one copy-safe cleanup JSON wrapper', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['slice:cleanup'], 'node scripts/slice-rehearse-ops-cli.mjs --cleanup');
});

test('cleanup rejects an unsafe task identity before resolving its registry path', async () => {
  const { executeCleanupRequest } = await import('./slice-rehearse-cleanup.mjs');
  let registryRead = false;
  assert.throws(
    () =>
      executeCleanupRequest(
        {
          schemaVersion: 1,
          mode: 'slice_owned',
          taskId: '../ESCAPE',
          artifactPaths: ['/private/tmp/owned'],
        },
        {
          readAuthority: () => inactive,
          readRegistry: () => {
            registryRead = true;
            return [];
          },
          inspect: () => null,
          remove: () => {},
        }
      ),
    /cleanup task is invalid/u
  );
  assert.equal(registryRead, false);
});
