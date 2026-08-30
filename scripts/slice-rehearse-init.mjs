import { budgetCategory } from './repo-size-budget-sync-core.mjs';
import { validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { compareText, sha256 } from './slice-rehearse-canonical.mjs';
import { canonicalModularityForPath } from './slice-rehearse-writer-policy.mjs';

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const WORK_CLASSES = new Set(['governance', 'product']);

function missingInputs(request, facts) {
  const missing = [];
  if (typeof request?.sliceId !== 'string' || !request.sliceId) missing.push('sliceId');
  if (!Number.isInteger(request?.tier)) missing.push('tier');
  if (!WORK_CLASSES.has(request?.workClass)) missing.push('workClass');
  if (!Array.isArray(request?.writerPaths) || !request.writerPaths.length)
    missing.push('writerPaths');
  if (!Array.isArray(request?.proofCommands) || !request.proofCommands.length)
    missing.push('proofCommands');
  if (!Array.isArray(request?.heavyLanes) || !request.heavyLanes.length) missing.push('heavyLanes');
  if (!SHA40.test(facts?.baseSha ?? '')) missing.push('baseSha');
  if (typeof facts?.origin !== 'string' || !facts.origin) missing.push('origin');
  if (!Array.isArray(facts?.existingPaths)) missing.push('existingPaths');
  if (!SHA256.test(facts?.workflowDigest ?? '')) missing.push('workflowDigest');
  if (!SHA256.test(facts?.substrateDigest ?? '')) missing.push('substrateDigest');
  if (request?.workClass === 'product' && facts?.authority?.source !== 'live-resolver') {
    missing.push('liveAuthority');
  }
  return missing.sort(compareText);
}

function planForPath(path, existingPaths, existingCapacityCaps, capacityDeltas) {
  const change = existingPaths.has(path) ? 'modify' : 'create';
  const modularity = canonicalModularityForPath(path, change);
  const maxLines = modularity.maxLines ?? 300;
  const requestedBytes =
    change === 'create' ? (path.includes('.test.') ? 12 * 1024 : 8 * 1024) : 8 * 1024;
  const ownerHeadroom = Math.max(
    requestedBytes,
    existingCapacityCaps[path] ?? 0,
    capacityDeltas[path] ?? 0
  );
  const maxBytesDelta = Math.min(modularity.maxBytes ?? ownerHeadroom, ownerHeadroom);
  return { path, change, category: budgetCategory(path), maxBytesDelta, maxLines };
}

export function initializeRehearsalManifest(request, facts) {
  const missing = missingInputs(request, facts);
  if (missing.length) throw new Error(`manifest inputs are missing: ${missing.join(', ')}`);
  if (
    request.workClass === 'product' &&
    (facts.authority.runtimeAuthorized !== true || facts.authority.activeSlice !== request.sliceId)
  ) {
    throw new Error(`live runtime authority does not grant ${request.sliceId}`);
  }
  const writerPaths = [...request.writerPaths].sort(compareText);
  const existingPaths = new Set(facts.existingPaths);
  const existingCapacityCaps = facts.existingCapacityCapsByPath ?? {};
  const capacityDeltas = facts.capacityDeltasByPath ?? {};
  const manifest = {
    schemaVersion: request.capacityOwnerId ? 2 : 1,
    ...(request.capacityOwnerId
      ? { capacityOwnerId: request.capacityOwnerId, workClass: request.workClass }
      : {}),
    sliceId: request.sliceId,
    tier: request.tier,
    baseSha: facts.baseSha,
    origin: facts.origin,
    writerPaths,
    pathPlans: writerPaths.map(path =>
      planForPath(path, existingPaths, existingCapacityCaps, capacityDeltas)
    ),
    routineOperations: [...(request.routineOperations ?? [])],
    proof: {
      commands: [...request.proofCommands],
      heavyLanes: [...request.heavyLanes],
      fullGateRequired: request.fullGateRequired ?? false,
      workflowDigest: facts.workflowDigest,
      substrateDigest: facts.substrateDigest,
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'none',
      repairAllocationId: null,
      repairPaths: [],
      projectionPaths: [],
    },
  };
  return validateRehearsalManifest(manifest);
}

export function defaultContractDigest(values) {
  return sha256([...values].sort(compareText).join('\n'));
}
