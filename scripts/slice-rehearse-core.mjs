import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { evaluatePrGatePolicy } from './ci/pr-gate-policy-lib.mjs';
import { CLOSEOUT } from './lean-current-authority-policy.mjs';
import { budgetCategory } from './repo-size-budget-sync-core.mjs';
import { FILE_CLASSES, structuredArtifactOwner } from './modularity-guard-policy.mjs';
import { normalizeRoutineOperations } from './slice-rehearse-operation-contracts.mjs';
import {
  compareText,
  exactKeys,
  must,
  nonEmptyString,
  positiveInteger,
  safeRelativePath,
  sortedText,
  sortedUnique,
} from './slice-rehearse-canonical.mjs';
import { canonicalModularityForPath } from './slice-rehearse-writer-policy.mjs';
import { normalizeManifestIdentity } from './slice-rehearse-manifest-identity.mjs';
export { ROUTINE_OPERATIONS } from './slice-rehearse-operation-contracts.mjs';
export { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
export { deriveOperationalEnvelope, rehearsalFactsSha256 } from './slice-rehearse-envelope.mjs';

const MANIFEST_KEYS = [
  'baseSha',
  'evidenceReceipts',
  'origin',
  'pathPlans',
  'proof',
  'routineOperations',
  'schemaVersion',
  'sliceId',
  'tier',
  'topology',
  'writerPaths',
];
const MANIFEST_V2_KEYS = [...MANIFEST_KEYS, 'capacityOwnerId', 'workClass'];
const PATH_PLAN_KEYS = ['category', 'change', 'maxBytesDelta', 'maxLines', 'path'];
const PROOF_KEYS = [
  'commands',
  'fullGateRequired',
  'heavyLanes',
  'substrateDigest',
  'workflowDigest',
];
const TOPOLOGY_KEYS = ['closeoutMode', 'projectionPaths', 'repairAllocationId', 'repairPaths'];
const CATEGORIES = new Set(CAPACITY_CATEGORIES);
const CHANGES = new Set(['create', 'modify']);
const CLOSEOUT_MODES = new Set(['none', 'projection-only']);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
export function validateRehearsalManifest(input) {
  must([1, 2].includes(input?.schemaVersion), 'unsupported manifest schema version');
  exactKeys(input, input.schemaVersion === 2 ? MANIFEST_V2_KEYS : MANIFEST_KEYS, 'manifest');
  const sliceId = nonEmptyString(input.sliceId, 'slice ID');
  must(/^[A-Z0-9][A-Z0-9-]*$/u.test(sliceId), 'slice ID is invalid');
  must(/^[a-z][a-z0-9-]+$/u.test(sliceId.toLowerCase()), 'slice allocation ID is invalid');
  const identity = normalizeManifestIdentity(input, sliceId);

  const writerPaths = sortedUnique(input.writerPaths, 'writer path', safeRelativePath);
  must(writerPaths.length > 0, 'writer paths must not be empty');
  must(Array.isArray(input.pathPlans), 'path plans must be an array');
  const pathPlans = input.pathPlans
    .map(plan => {
      exactKeys(plan, PATH_PLAN_KEYS, 'path plan');
      const path = safeRelativePath(plan.path, 'path plan path');
      must(CHANGES.has(plan.change), 'path plan change is invalid');
      must(CATEGORIES.has(plan.category), 'path plan category is invalid');
      must(plan.category === budgetCategory(path), `path plan canonical category differs: ${path}`);
      must(
        Number.isSafeInteger(plan.maxBytesDelta) && plan.maxBytesDelta >= 0,
        'path plan byte delta is invalid'
      );
      positiveInteger(plan.maxLines, 'path plan max lines');
      const modularity = canonicalModularityForPath(path, plan.change);
      if (modularity.fileClass === FILE_CLASSES.structuredArtifact) {
        must(structuredArtifactOwner(path), `structured artifact has no canonical owner: ${path}`);
      }
      if (modularity.maxLines !== null && modularity.maxLines !== undefined) {
        must(plan.maxLines <= modularity.maxLines, `path plan exceeds canonical line cap: ${path}`);
      }
      if (modularity.maxBytes !== null && modularity.maxBytes !== undefined) {
        must(
          plan.maxBytesDelta <= modularity.maxBytes,
          `path plan exceeds canonical byte cap: ${path}`
        );
      }
      return { ...plan, path };
    })
    .sort((left, right) => compareText(left.path, right.path));
  must(
    new Set(pathPlans.map(plan => plan.path)).size === pathPlans.length,
    'path plans must be unique'
  );
  must(
    JSON.stringify(pathPlans.map(plan => plan.path)) === JSON.stringify(writerPaths),
    'path plan paths must exactly match writer paths'
  );

  const routineOperations = normalizeRoutineOperations(input.routineOperations);
  for (const operation of routineOperations) {
    if (operation?.target?.taskId) {
      must(operation.target.taskId === sliceId, 'operation task differs from rehearsal slice');
    }
    if (operation?.target?.origin) {
      must(
        operation.target.origin === input.origin.replace(/\.git$/u, ''),
        'operation origin differs'
      );
    }
  }

  exactKeys(input.proof, PROOF_KEYS, 'proof');
  const commands = sortedUnique(input.proof.commands, 'proof command');
  must(commands.length > 0, 'proof commands must not be empty');
  const heavyLanes = sortedUnique(input.proof.heavyLanes, 'heavy proof lane');
  must(typeof input.proof.fullGateRequired === 'boolean', 'full-gate requirement must be boolean');
  must(DIGEST_PATTERN.test(input.proof.workflowDigest), 'proof workflow digest is invalid');
  must(DIGEST_PATTERN.test(input.proof.substrateDigest), 'proof substrate digest is invalid');

  must(Array.isArray(input.evidenceReceipts), 'evidence receipts must be an array');
  exactKeys(input.topology, TOPOLOGY_KEYS, 'topology');
  must(CLOSEOUT_MODES.has(input.topology.closeoutMode), 'closeout mode is invalid');
  const projectionPaths = sortedUnique(
    input.topology.projectionPaths,
    'projection path',
    safeRelativePath
  );
  const repairPaths = sortedUnique(input.topology.repairPaths, 'repair path', safeRelativePath);
  const repairAllocationId = input.topology.repairAllocationId;
  for (const path of [...projectionPaths, ...repairPaths]) {
    must(writerPaths.includes(path), `topology path is not a writer path: ${path}`);
  }
  if (input.topology.closeoutMode === 'none') {
    must(
      projectionPaths.length === 0 && repairPaths.length === 0,
      'topology paths must be empty when closeout mode is none'
    );
    must(repairAllocationId === null, 'repair allocation must be null without closeout');
  } else {
    must(projectionPaths.length > 0, 'projection-only topology must have projection paths');
    must(
      JSON.stringify(projectionPaths) === JSON.stringify(sortedText(CLOSEOUT)),
      'projection-only topology must use the canonical closeout paths'
    );
    const projectionSet = new Set(projectionPaths);
    must(
      repairPaths.every(path => !projectionSet.has(path)),
      'projection and repair topology paths must be disjoint'
    );
    const covered = [...projectionPaths, ...repairPaths].sort(compareText);
    must(
      JSON.stringify(covered) === JSON.stringify(writerPaths),
      'projection and repair topology paths must exactly cover writer paths'
    );
    if (repairPaths.length) {
      must(
        typeof repairAllocationId === 'string' && /^[a-z][a-z0-9-]+$/u.test(repairAllocationId),
        'repair allocation ID is invalid'
      );
    } else {
      must(repairAllocationId === null, 'pure projection repair allocation must be null');
    }
  }

  const gatePolicy = evaluatePrGatePolicy({
    eventName: 'pull_request',
    draft: false,
    changedFiles: writerPaths,
    changedFilesComplete: true,
  });
  const fullGateRequired = input.proof.fullGateRequired || gatePolicy.forceFull;

  return {
    schemaVersion: input.schemaVersion,
    ...identity.versionFields,
    sliceId,
    tier: identity.tier,
    baseSha: input.baseSha,
    origin: input.origin,
    writerPaths,
    pathPlans,
    routineOperations,
    proof: {
      commands,
      heavyLanes,
      fullGateRequired,
      workflowDigest: input.proof.workflowDigest,
      substrateDigest: input.proof.substrateDigest,
    },
    evidenceReceipts: [...input.evidenceReceipts],
    topology: {
      closeoutMode: input.topology.closeoutMode,
      repairAllocationId,
      repairPaths,
      projectionPaths,
    },
  };
}
