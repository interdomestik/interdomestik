import {
  canonicalJson,
  compareText,
  exactKeys,
  must,
  normalizeArtifactPath,
  sha256,
} from './slice-rehearse-canonical.mjs';
import { resolve, sep } from 'node:path';

const TASK = /^[A-Z0-9][A-Z0-9-]*$/u;
const ENVELOPE = /^[A-Z0-9][A-Z0-9-]*-GLOBAL-HYGIENE-[1-9]\d*$/u;
const KEYS = [
  'approvalEnvelopeId',
  'approvalBindingSha256',
  'artifactPaths',
  'mode',
  'recoveryBundlePath',
  'recoveryBundleSha256',
  'schemaVersion',
  'separatelyAuthorized',
  'taskId',
  'targetIdentities',
];
const SHA256 = /^[0-9a-f]{64}$/u;
const IDENTITY_KEYS = ['device', 'inode', 'realPath', 'type'];

function assertInactive(authority) {
  must(
    authority?.source === 'live-resolver' &&
      authority.runtimeAuthorized === false &&
      authority.activeSlice === null,
    'cleanup requires live inactive authority'
  );
}

export function validateCleanupEnvelope(input, authority) {
  assertInactive(authority);
  exactKeys(input, KEYS, 'cleanup envelope');
  must(input.schemaVersion === 1 && TASK.test(input.taskId), 'cleanup identity is invalid');
  must(['slice_owned', 'global_hygiene'].includes(input.mode), 'cleanup mode is invalid');
  must(
    Array.isArray(input.artifactPaths) && input.artifactPaths.length > 0,
    'cleanup artifacts are required'
  );
  const artifactPaths = input.artifactPaths.map(normalizeArtifactPath).sort(compareText);
  must(new Set(artifactPaths).size === artifactPaths.length, 'cleanup artifacts must be unique');
  must(
    input.targetIdentities &&
      typeof input.targetIdentities === 'object' &&
      !Array.isArray(input.targetIdentities),
    'cleanup target identities are required'
  );
  must(
    JSON.stringify(Object.keys(input.targetIdentities).sort(compareText)) ===
      JSON.stringify(artifactPaths),
    'cleanup target identities differ from artifacts'
  );
  for (const [path, identity] of Object.entries(input.targetIdentities)) {
    exactKeys(identity, IDENTITY_KEYS, `cleanup target identity ${path}`);
    must(identity.realPath === resolve(path), 'cleanup target realpath differs');
    must(['directory', 'file'].includes(identity.type), 'cleanup target type is invalid');
    must(
      /^\d+$/u.test(identity.device) && /^\d+$/u.test(identity.inode),
      'cleanup target inode identity is invalid'
    );
  }
  if (input.mode === 'slice_owned') {
    must(
      input.approvalEnvelopeId === null &&
        input.approvalBindingSha256 === null &&
        input.recoveryBundlePath === null &&
        input.recoveryBundleSha256 === null &&
        input.separatelyAuthorized === false,
      'slice-owned cleanup must not imply global authority'
    );
  } else {
    must(
      input.separatelyAuthorized === true && ENVELOPE.test(input.approvalEnvelopeId ?? ''),
      'global hygiene requires separate explicit authorization'
    );
    must(typeof input.recoveryBundlePath === 'string', 'global hygiene must be recoverable');
    const recoveryBundlePath = normalizeArtifactPath(input.recoveryBundlePath);
    must(
      SHA256.test(input.recoveryBundleSha256 ?? ''),
      'global hygiene recovery digest is invalid'
    );
    must(
      artifactPaths.every(path => {
        const target = resolve(path);
        const recovery = resolve(recoveryBundlePath);
        return !(
          recovery === target ||
          recovery.startsWith(`${target}${sep}`) ||
          target.startsWith(`${recovery}${sep}`)
        );
      }),
      'recovery bundle must not overlap cleanup targets'
    );
    const binding = sha256(
      canonicalJson({
        approvalEnvelopeId: input.approvalEnvelopeId,
        artifactPaths,
        recoveryBundlePath,
        recoveryBundleSha256: input.recoveryBundleSha256,
        taskId: input.taskId,
      })
    );
    must(input.approvalBindingSha256 === binding, 'global hygiene approval binding differs');
  }
  return { ...input, artifactPaths };
}

export function deriveSliceOwnedCleanup({ taskId, authority, registry }) {
  assertInactive(authority);
  must(TASK.test(taskId ?? ''), 'cleanup task is invalid');
  must(
    Array.isArray(registry) && registry.length > 0,
    'slice-owned cleanup artifacts are required'
  );
  must(
    registry.every(
      item =>
        item?.ownerTaskId === taskId &&
        item.safeToDiscard === true &&
        item.realPath === resolve(item.path) &&
        ['directory', 'file'].includes(item.type) &&
        /^\d+$/u.test(item.device) &&
        /^\d+$/u.test(item.inode)
    ),
    'slice-owned cleanup registry ownership is unverified'
  );
  const targetIdentities = Object.fromEntries(
    registry.map(item => [
      normalizeArtifactPath(item.path),
      {
        realPath: item.realPath,
        type: item.type,
        device: item.device,
        inode: item.inode,
      },
    ])
  );
  return validateCleanupEnvelope(
    {
      schemaVersion: 1,
      mode: 'slice_owned',
      taskId,
      artifactPaths: registry.map(item => item.path),
      approvalEnvelopeId: null,
      approvalBindingSha256: null,
      recoveryBundlePath: null,
      recoveryBundleSha256: null,
      separatelyAuthorized: false,
      targetIdentities,
    },
    authority
  );
}

export function verifyCleanupTargetsImmediatelyBeforeDeletion(envelope, { inspect }) {
  must(typeof inspect === 'function', 'cleanup target inspector is unavailable');
  for (const path of envelope.artifactPaths) {
    const expected = envelope.targetIdentities[path];
    const current = inspect(path);
    must(
      current && IDENTITY_KEYS.every(key => current[key] === expected[key]),
      `cleanup target identity changed: ${path}`
    );
  }
  return true;
}
