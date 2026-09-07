import { tmpdir } from 'node:os';
import {
  currentProofInputsMatch,
  deriveProofObligationGraph,
  invalidatedProofNodes,
} from './slice-rehearse-proof-obligations.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  compareText,
  deriveEvidenceIdentityKey,
  must,
  readBoundedRegularText,
} from './slice-rehearse-canonical.mjs';
import { runHeavyProofExecution } from './slice-rehearse-proof-executor.mjs';
export {
  authorizedHeavyProofHost,
  executePnpmProof,
  validateProofExecutionPlan,
  runHeavyProofExecution,
} from './slice-rehearse-proof-executor.mjs';
export {
  acquireHeavyProofExecutionLease,
  heavyProofLedgerPath,
  recordHeavyProofExecution,
} from './slice-rehearse-evidence.mjs';
const KEY = /^[0-9a-f]{64}$/u;
export function planInvalidatedProofs({
  requiredLanes,
  decisions,
  expectedByLane,
  currentInputsByLane,
  previousInputsByLane,
  obligationContract,
  changedNodes = [],
  now = Date.now(),
}) {
  must(Array.isArray(requiredLanes) && requiredLanes.length > 0, 'required lanes are unavailable');
  must(Array.isArray(decisions), 'proof decisions are unavailable');
  const graph = deriveProofObligationGraph(obligationContract);
  const invalidNodes = invalidatedProofNodes(graph, changedNodes);
  const graphIds = new Set(graph.map(node => node.id));
  must(
    expectedByLane && typeof expectedByLane === 'object',
    'expected proof identity is unavailable'
  );
  must(requiredLanes.includes('pr-e2e'), 'required PR E2E executor lane is missing');
  const required = [...requiredLanes].sort(compareText);
  must(new Set(required).size === required.length, 'required lanes must be unique');
  const byLane = new Map();
  for (const decision of decisions) {
    must(typeof decision?.lane === 'string', 'lane decision is invalid');
    must(typeof decision.reusable === 'boolean', 'lane decision is invalid');
    if (decision.key !== null) must(KEY.test(decision.key), 'evidence key is invalid');
    if (decision.reusable) {
      must(Number.isFinite(Date.parse(decision.expiresAt)), 'reusable evidence expiry is invalid');
    }
    const laneDecisions = byLane.get(decision.lane) ?? [];
    laneDecisions.push(decision);
    byLane.set(decision.lane, laneDecisions);
  }
  const reuse = required.filter(lane => {
    if (!graphIds.has(lane) || invalidNodes.includes(lane)) return false;
    must(expectedByLane[lane], `expected proof identity is missing: ${lane}`);
    const expectedKey = deriveEvidenceIdentityKey({ lane, ...expectedByLane[lane] });
    if (!currentProofInputsMatch(previousInputsByLane?.[lane], currentInputsByLane?.[lane], now))
      return false;
    if (
      currentInputsByLane[lane].headSha !== expectedByLane[lane].headSha ||
      currentInputsByLane[lane].treeSha !== expectedByLane[lane].treeSha
    )
      return false;
    const matching = (byLane.get(lane) ?? []).filter(
      item => item.key === expectedKey || item.key === null
    );
    if (matching.some(item => !item.reusable)) return false;
    return matching.some(
      decision =>
        decision.reusable === true &&
        decision.key === expectedKey &&
        Date.parse(decision.expiresAt) > now
    );
  });
  return {
    reuse,
    run: required
      .filter(lane => !reuse.includes(lane))
      .map(lane => {
        must(expectedByLane[lane], `expected proof identity is missing: ${lane}`);
        return {
          lane,
          evidenceKey: deriveEvidenceIdentityKey({ lane, ...expectedByLane[lane] }),
        };
      }),
  };
}
function parseRecordArgs(argv) {
  must(
    argv.length === 6 &&
      argv[0] === '--report' &&
      argv[2] === '--execution' &&
      argv[4] === '--ledger',
    'usage: --report <path> --execution <path> --ledger <path>'
  );
  must(argv[1] && argv[3] && argv[5], 'usage: --report <path> --execution <path> --ledger <path>');
  return { reportPath: argv[1], executionPath: argv[3], ledgerPath: argv[5] };
}
export function runHeavyProofRecordCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value),
  executeProof = runHeavyProofExecution,
} = {}) {
  try {
    const { reportPath, executionPath, ledgerPath } = parseRecordArgs(argv);
    const allowedRoots = [cwd, tmpdir(), '/private/tmp'];
    const execution = JSON.parse(
      readBoundedRegularText(resolve(cwd, executionPath), {
        label: 'Heavy proof execution',
        maxBytes: 16 * 1024,
        allowedRoots,
      })
    );
    const report = JSON.parse(
      readBoundedRegularText(resolve(cwd, reportPath), {
        label: 'Heavy proof report',
        maxBytes: 1024 * 1024,
        allowedRoots,
      })
    );
    const result = executeProof({
      ledgerPath: resolve(cwd, ledgerPath),
      execution,
      report,
    });
    stdout(canonicalJson({ evidenceKey: execution.evidenceKey, ...result }));
    return result.status === 'succeeded' ? 0 : 1;
  } catch (error) {
    stderr(`heavy proof execution was not recorded: ${error.message}\n`);
    return 1;
  }
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runHeavyProofRecordCli();
}
