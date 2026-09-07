import {
  canonicalJson,
  compareText,
  exactKeys,
  must,
  sha256,
} from './slice-rehearse-canonical.mjs';
import { resolveRecoveryProcedures } from './slice-rehearse-operation-registry.mjs';

const REPORT_KEYS =
  'schemaVersion sliceId tier repository writers capacity modularity topology evidence deficits authorityStops operationalEnvelope reportSha256'.split(
    ' '
  );
const DIGEST = /^[0-9a-f]{64}$/u;
const LIMIT = 256;
const known = new Set([
  'repository:outside-writer-dirty',
  'repository:outside-writer-committed',
  'repository:origin-mismatch',
  'repository:provider-repository-mismatch',
  'repository:base-identity-mismatch',
  'repository:protected-main-writer-overlap',
  'repository:writer-facts-incomplete',
  'repository:protected-main-advanced',
  'capacity:worktree-budget-drift',
  'capacity:worktree-budget-rebind',
  'capacity:budget-self-size-stale',
  'capacity:writer-owner-overlap',
  'capacity:no-attributable-writers',
  'capacity:new-allocation-missing-budget-writer',
  'capacity:rebase-allocation-unavailable',
  'capacity:fixed-point-upper-bound',
  'envelope:missing-operation',
  'envelope:operation-precondition-unverified',
  'evidence:heavy-proof-required',
  'proof:full-gate',
  'topology:repair-before-closeout',
]);
const pathCodes = [
  'modularity:line-cap',
  'modularity:absolute-byte-cap',
  'modularity:structured-owner-missing',
  'capacity:largest-file-current',
  'capacity:largest-file-planned',
  'capacity:source-or-test-lines-current',
  'capacity:source-or-test-lines-planned',
  'capacity:path-cap-drift',
  'repository:path-plan-mismatch',
  'repository:writer-missing',
];
const missingReasons = new Map([
  ['authority-facts-unavailable', 'current-authority'],
  ['delivery-facts-unavailable', 'operation-facts'],
  ['remote-head-unavailable', 'remote-head'],
  ['pull-request-unavailable', 'pull-request'],
  ['artifact-uninspectable', 'resource-ownership'],
  ['artifact-discard-unverified', 'resource-ownership'],
]);
const unique = values => [...new Set(values)].sort(compareText);

// Reject non-JSON objects before hashing: no getters, hidden values, cycles,
// oversized collections or lossy JSON serialization at the diagnostic boundary.
function boundedJson(value) {
  let nodes = 0;
  let bytes = 0;
  const visit = (item, depth) => {
    must(++nodes <= 100_000 && depth <= 32, 'diagnostic input exceeds bounds');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item);
      must(bytes <= 8 * 1024 * 1024, 'diagnostic string exceeds bounds');
      return;
    }
    if (typeof item === 'number') {
      must(Number.isSafeInteger(item), 'diagnostic number is invalid');
      return;
    }
    must(item && typeof item === 'object', 'diagnostic input must be JSON');
    const array = Array.isArray(item);
    must(
      array || [Object.prototype, null].includes(Object.getPrototypeOf(item)),
      'diagnostic object is invalid'
    );
    const keys = Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
    must(keys.length <= 4096, 'diagnostic collection exceeds bounds');
    if (array)
      must(
        item.length === keys.length && keys.every((key, index) => key === String(index)),
        'diagnostic array is invalid'
      );
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      must(
        typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'),
        'diagnostic field is invalid'
      );
      visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0);
  must(
    Buffer.byteLength(canonicalJson(value)) <= 8 * 1024 * 1024,
    'diagnostic input exceeds bytes'
  );
}

function reportOrigin(report) {
  boundedJson(report);
  exactKeys(report, REPORT_KEYS, 'diagnostic report');
  must(report.schemaVersion === 1, 'diagnostic report schema is invalid');
  for (const list of [report.authorityStops, report.deficits, report.writers?.routineOperations])
    must(Array.isArray(list) && list.length <= LIMIT, 'diagnostic report array exceeds bounds');
  resolveRecoveryProcedures(
    report.writers.routineOperations.map(
      operation => `routine:${typeof operation === 'string' ? operation : operation?.operation}`
    )
  );
  must(
    report.operationalEnvelope === null || report.operationalEnvelope?.authorityGranted === false,
    'diagnostic report grants authority'
  );
  must(
    !report.authorityStops.length || report.operationalEnvelope === null,
    'stopped report envelope must be null'
  );
  must(
    report.reportSha256 === sha256(canonicalJson({ ...report, reportSha256: null })),
    'diagnostic report digest is invalid'
  );
  const origin = {
    reportSha256: report.reportSha256,
    writerFactsDigest: report.repository?.writerFactsDigest,
    writerMapDigest: report.writers?.digest,
    budgetArtifactSha256: report.capacity?.budgetArtifact?.sha256,
    workflowDigest: report.evidence?.proof?.workflowDigest,
    substrateDigest: report.evidence?.proof?.substrateDigest,
  };
  must(
    Object.values(origin).every(value => typeof value === 'string' && DIGEST.test(value)),
    'diagnostic origin digest is invalid'
  );
  return origin;
}

function blocker(item, report) {
  must(item && typeof item.code === 'string', 'diagnostic blocker is invalid');
  let code = known.has(item.code)
    ? item.code
    : pathCodes.find(
        prefix =>
          item.code.startsWith(`${prefix}:`) &&
          report.writers.paths?.includes(item.code.slice(prefix.length + 1))
      );
  code ??= 'diagnostic:unknown-hold';
  const recoveryIds = ['diagnostic:recollect'];
  if (item.coveredBy !== undefined) {
    resolveRecoveryProcedures([`routine:${item.coveredBy}`]);
    if (code !== 'diagnostic:unknown-hold') recoveryIds.push(`routine:${item.coveredBy}`);
  }
  if (item.operation !== undefined) resolveRecoveryProcedures([`routine:${item.operation}`]);
  if (item.operations !== undefined) {
    must(
      Array.isArray(item.operations) && item.operations.length <= LIMIT,
      'diagnostic operations exceed bounds'
    );
    resolveRecoveryProcedures(item.operations.map(name => `routine:${name}`));
  }
  if (code === 'diagnostic:unknown-hold') recoveryIds.push('diagnostic:unknown-hold');
  const missingFacts = [];
  if (code === 'repository:writer-facts-incomplete') missingFacts.push('writer-facts');
  if (code === 'envelope:missing-operation') missingFacts.push('operation-contract');
  if (code === 'evidence:heavy-proof-required') {
    missingFacts.push('proof-evidence');
    if (item.reason === 'current_proof_inputs_unavailable')
      missingFacts.push('current-proof-inputs');
  }
  if (code === 'envelope:operation-precondition-unverified')
    missingFacts.push(missingReasons.get(item.reason) ?? 'operation-preconditions');
  return {
    code,
    missingFacts,
    recoveryIds: unique(recoveryIds),
    dependsOn: ['origin:reportSha256'],
    invalidates: ['origin:reportSha256'],
  };
}

export function deriveRecoveryPlan(report) {
  const origin = reportOrigin(report);
  const mapped = [...report.authorityStops, ...report.deficits].map(item => blocker(item, report));
  const blockers = [...new Map(mapped.map(item => [canonicalJson(item), item])).values()].sort(
    (a, b) => compareText(canonicalJson(a), canonicalJson(b))
  );
  must(blockers.length <= LIMIT, 'diagnostic blockers exceed bounds');
  return { schemaVersion: 1, origin, blockers };
}

export function validateRecoveryPlan(plan, report) {
  boundedJson(plan);
  exactKeys(plan, ['schemaVersion', 'origin', 'blockers'], 'recovery plan');
  must(
    Array.isArray(plan.blockers) && plan.blockers.length <= LIMIT,
    'recovery blockers exceed bounds'
  );
  const expected = deriveRecoveryPlan(report);
  must(canonicalJson(plan) === canonicalJson(expected), 'recovery plan differs from report');
  return plan;
}

export function withRehearsalDiagnostics(report) {
  const recoveryPlan = deriveRecoveryPlan(report);
  const procedures = resolveRecoveryProcedures(
    unique(recoveryPlan.blockers.flatMap(item => item.recoveryIds))
  );
  return { report, recoveryPlan, procedures };
}
