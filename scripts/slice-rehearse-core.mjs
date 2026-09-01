import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { evaluatePrGatePolicy } from './ci/pr-gate-policy-lib.mjs';
import { CLOSEOUT, validPromotionWriterPaths } from './lean-current-authority-policy.mjs';
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
const CLOSEOUT_MODES = new Set(['none', 'projection-only', 'promotion']);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const samePaths = (left, right) =>
  left.length === right.length && left.every((path, index) => path === right[index]);
export function validateRehearsalManifest(input) {
  must([1, 2].includes(input?.schemaVersion), 'unsupported manifest schema version');
  exactKeys(input, input.schemaVersion === 2 ? MANIFEST_V2_KEYS : MANIFEST_KEYS, 'manifest');
  const sliceId = nonEmptyString(input.sliceId, 'slice ID');
  must(/^[A-Z0-9][A-Z0-9-]*$/u.test(sliceId), 'slice ID is invalid');
  must(/^[a-z][a-z0-9-]+$/u.test(sliceId.toLowerCase()), 'slice allocation ID is invalid');
  const identity = normalizeManifestIdentity(input, sliceId);

  const writers = sortedUnique(input.writerPaths, 'writer path', safeRelativePath);
  must(writers.length > 0, 'writer paths must not be empty');
  must(Array.isArray(input.pathPlans), 'path plans must be an array');
  const plans = input.pathPlans
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
  must(new Set(plans.map(plan => plan.path)).size === plans.length, 'path plans must be unique');
  must(
    samePaths(
      plans.map(plan => plan.path),
      writers
    ),
    'path plans differ from writers'
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
  const projections = sortedUnique(
    input.topology.projectionPaths,
    'projection path',
    safeRelativePath
  );
  const repairs = sortedUnique(input.topology.repairPaths, 'repair path', safeRelativePath);
  const repairId = input.topology.repairAllocationId;
  const mode = input.topology.closeoutMode;
  for (const path of [...projections, ...repairs]) {
    must(writers.includes(path), `topology path is not a writer path: ${path}`);
  }
  if (mode === 'none') {
    must(!projections.length && !repairs.length, 'topology paths require closeout');
    must(repairId === null, 'repair allocation requires closeout');
  } else if (mode === 'projection-only') {
    must(samePaths(projections, CLOSEOUT), 'projection paths are not canonical');
    const projectionSet = new Set(projections);
    must(
      repairs.every(path => !projectionSet.has(path)),
      'projection and repair paths overlap'
    );
    must(samePaths([...projections, ...repairs].sort(compareText), writers), 'writers not covered');
    if (repairs.length) {
      must(
        typeof repairId === 'string' && /^[a-z][a-z0-9-]+$/u.test(repairId),
        'repair allocation ID is invalid'
      );
    } else {
      must(repairId === null, 'pure projection repair allocation must be null');
    }
  } else {
    must(validPromotionWriterPaths(writers), 'promotion writer map is invalid');
    must(samePaths(projections, writers), 'promotion owner paths differ');
    must(!repairs.length && repairId === null, 'promotion cannot repair capacity');
  }

  const gatePolicy = evaluatePrGatePolicy({
    eventName: 'pull_request',
    draft: false,
    changedFiles: writers,
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
    writerPaths: writers,
    pathPlans: plans,
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
      repairAllocationId: repairId,
      repairPaths: repairs,
      projectionPaths: projections,
    },
  };
}
