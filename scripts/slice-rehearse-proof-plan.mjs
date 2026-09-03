import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  compareText,
  deriveEvidenceIdentityKey,
  must,
  readBoundedRegularText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import {
  acquireHeavyProofExecutionLease,
  normalizeHeavyProofExecution,
  recordHeavyProofExecution,
} from './slice-rehearse-evidence.mjs';
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
  now = Date.now(),
}) {
  must(Array.isArray(requiredLanes) && requiredLanes.length > 0, 'required lanes are unavailable');
  must(Array.isArray(decisions), 'proof decisions are unavailable');
  must(
    expectedByLane && typeof expectedByLane === 'object',
    'expected proof identity is unavailable'
  );
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
    must(expectedByLane[lane], `expected proof identity is missing: ${lane}`);
    const expectedKey = deriveEvidenceIdentityKey({ lane, ...expectedByLane[lane] });
    return (byLane.get(lane) ?? []).some(
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
function defaultVerifyCandidate(report) {
  const options = {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  };
  return (
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], options).trim() ===
      report.repository?.headSha &&
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], options).trim() ===
      report.repository?.treeSha &&
    execFileSync('/usr/bin/git', ['status', '--porcelain'], options).trim() === ''
  );
}
export function validateProofExecutionPlan(
  report,
  execution,
  verifyCandidate = defaultVerifyCandidate
) {
  const value = normalizeHeavyProofExecution(execution);
  must(
    report && typeof report === 'object' && !Array.isArray(report),
    'proof report is unavailable'
  );
  must(report.schemaVersion === 1, 'proof report schema is invalid');
  must(
    report.reportSha256 === sha256(canonicalJson({ ...report, reportSha256: null })),
    'proof report digest is invalid'
  );
  must(
    Array.isArray(report.authorityStops) && report.authorityStops.length === 0,
    'proof report has authority stops'
  );
  const planned = report.evidence?.executionPlan?.run;
  must(Array.isArray(planned), 'proof execution plan is unavailable');
  const pending = report.operationalEnvelope?.requiredOperations ?? [];
  must(
    !pending.some(operation =>
      /^(?:add_focused_test|bounded_force_with_lease_rebuild|derived_capacity_rebind|extract_cohesive_helper|fresh_worktree_patch_replay|sequence_prerequisite_before_projection|split_focused_test)$/u.test(
        operation
      )
    ),
    'identity-changing work is pending before heavy proof'
  );
  must(
    planned.some(item => item?.lane === value.lane && item?.evidenceKey === value.evidenceKey),
    'heavy proof execution is outside the invalidated-only plan'
  );
  must(
    typeof verifyCandidate === 'function' && verifyCandidate(report) === true,
    'heavy proof candidate identity differs'
  );
  return value;
}
const PROOF_COMMANDS = Object.freeze({
  'pr-e2e': Object.freeze(
    [['e2e:gate:pr'], ['--filter', '@interdomestik/web', 'run', 'e2e:smoke']].map(Object.freeze)
  ),
});
const defaultPnpm = () => process.env.npm_execpath ?? resolve(dirname(process.execPath), 'pnpm');
const isTrustedPnpm = path => isAbsolute(path ?? '') && /\/pnpm(?:\.[cm]?js)?$/u.test(path);
export function executePnpmProof(
  args,
  { nodePath = process.execPath, npmExecPath = defaultPnpm(), spawn = spawnSync } = {}
) {
  must(isAbsolute(nodePath), 'trusted Node runtime is unavailable');
  must(isTrustedPnpm(npmExecPath), 'trusted pnpm runtime is unavailable');
  return spawn(nodePath, [npmExecPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 90 * 60_000,
  });
}
export function authorizedHeavyProofHost({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') return false;
  return (
    (env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux') ||
    env.RUNNER_NAME === 'interdomestik-z620-staging'
  );
}
export function runHeavyProofExecution({
  ledgerPath,
  execution,
  report,
  execute = executePnpmProof,
  verifyCandidate,
  record = recordHeavyProofExecution,
  acquireLease = acquireHeavyProofExecutionLease,
  verifyProofHost = authorizedHeavyProofHost,
}) {
  const value = validateProofExecutionPlan(report, execution, verifyCandidate);
  const commands = PROOF_COMMANDS[value.lane];
  must(commands, 'heavy proof lane has no fixed executor');
  must(verifyProofHost({ report, execution: value }) === true, 'heavy proof host is unauthorized');
  const { sliceId } = report;
  const { headSha, treeSha } = report.repository;
  const scope = { sliceId, headSha, treeSha };
  const releaseLease = acquireLease({ ledgerPath, scope, execution: value });
  must(typeof releaseLease === 'function', 'heavy proof lease is invalid');
  try {
    for (let index = 0; index < commands.length; index += 1) {
      const result = execute(commands[index]);
      if (result?.status !== 0) {
        const exitCode = Number.isInteger(result?.status) ? result.status : null;
        return {
          commandIndex: index,
          exitCode,
          lane: value.lane,
          runId: value.runId,
          status: 'failed',
        };
      }
    }
    record({
      ledgerPath,
      scope,
      execution: value,
      status: 'succeeded',
      finishedAt: new Date().toISOString(),
      exitCode: 0,
    });
    return { lane: value.lane, runId: value.runId, status: 'succeeded' };
  } finally {
    releaseLease();
  }
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
