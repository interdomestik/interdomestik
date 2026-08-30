import {
  compareText,
  exactKeys,
  must,
  normalizeArtifactPath,
} from './slice-rehearse-canonical.mjs';

const TASK = /^[A-Z0-9][A-Z0-9-]*$/u;
const ENVELOPE = /^[A-Z0-9][A-Z0-9-]*-GLOBAL-HYGIENE-[1-9]\d*$/u;
const KEYS = [
  'approvalEnvelopeId',
  'artifactPaths',
  'mode',
  'recoveryBundlePath',
  'schemaVersion',
  'separatelyAuthorized',
  'taskId',
];

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
  if (input.mode === 'slice_owned') {
    must(
      input.approvalEnvelopeId === null &&
        input.recoveryBundlePath === null &&
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
      !artifactPaths.includes(recoveryBundlePath),
      'recovery bundle must remain outside cleanup targets'
    );
  }
  return { ...input, artifactPaths };
}

export function deriveSliceOwnedCleanup({ taskId, authority, artifacts }) {
  assertInactive(authority);
  must(TASK.test(taskId ?? ''), 'cleanup task is invalid');
  must(
    Array.isArray(artifacts) && artifacts.length > 0,
    'slice-owned cleanup artifacts are required'
  );
  must(
    artifacts.every(
      item => item?.exists === true && item.ownerTaskId === taskId && item.safeToDiscard === true
    ),
    'slice-owned cleanup ownership is unverified'
  );
  return validateCleanupEnvelope(
    {
      schemaVersion: 1,
      mode: 'slice_owned',
      taskId,
      artifactPaths: artifacts.map(item => item.path),
      approvalEnvelopeId: null,
      recoveryBundlePath: null,
      separatelyAuthorized: false,
    },
    authority
  );
}
