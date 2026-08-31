import { execFileSync, spawnSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalize,
  canonicalJson,
  compareText,
  deriveEvidenceIdentityKey,
  exactKeys,
  must,
  readBoundedRegularText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';

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

const EXECUTION_KEYS = ['evidenceKey', 'lane', 'runId', 'startedAt'];
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const LANE = /^[a-z0-9][a-z0-9:_-]*$/u;
function normalizeExecution(execution) {
  exactKeys(execution, EXECUTION_KEYS, 'heavy proof execution');
  must(KEY.test(execution.evidenceKey ?? ''), 'heavy proof evidence key is invalid');
  must(RUN_ID.test(execution.runId ?? ''), 'heavy proof run ID is invalid');
  must(LANE.test(execution.lane ?? ''), 'heavy proof lane is invalid');
  must(Number.isFinite(Date.parse(execution.startedAt)), 'heavy proof start time is invalid');
  return execution;
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
  const value = normalizeExecution(execution);
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
function trustedLedgerPath(ledgerPath, allowedRoots) {
  const normalizedPath = resolve(ledgerPath);
  const trustedRoot = [...allowedRoots]
    .map(root => resolve(root))
    .filter(root => root !== '/')
    .sort((left, right) => right.length - left.length)
    .find(root => normalizedPath.startsWith(`${root}${sep}`));
  must(trustedRoot, 'heavy proof ledger must stay inside a trusted root');
  return trustedRunnerFile(normalizedPath, { runnerTemp: trustedRoot });
}
export function recordHeavyProofExecution({
  ledgerPath,
  execution,
  allowedRoots = [process.cwd(), tmpdir(), '/private/tmp'],
}) {
  const normalizedPath = trustedLedgerPath(ledgerPath, allowedRoots);
  const lockPath = `${normalizedPath}.lock`;
  let lock;
  try {
    lock = openSync(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600
    );
    let records = [];
    if (existsSync(normalizedPath)) {
      const descriptor = openSync(normalizedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        must(fstatSync(descriptor).isFile(), 'heavy proof ledger must be a regular file');
        records = readFileSync(descriptor, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => normalizeExecution(JSON.parse(line)));
      } finally {
        closeSync(descriptor);
      }
    }
    const value = normalizeExecution(execution);
    must(!records.some(item => item.runId === value.runId), 'heavy proof run ID already exists');
    must(
      !records.some(item => item.evidenceKey === value.evidenceKey),
      'duplicate heavy proof is forbidden'
    );
    const descriptor = openSync(
      normalizedPath,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600
    );
    try {
      writeSync(descriptor, `${JSON.stringify(canonicalize(value))}\n`, null, 'utf8');
    } finally {
      closeSync(descriptor);
    }
    return true;
  } finally {
    if (lock !== undefined) {
      closeSync(lock);
      unlinkSync(lockPath);
    }
  }
}

const PROOF_COMMANDS = Object.freeze({
  'pr-e2e': Object.freeze([
    Object.freeze(['e2e:gate:pr']),
    Object.freeze(['--filter', '@interdomestik/web', 'run', 'e2e:smoke']),
  ]),
});
export function runHeavyProofExecution({
  ledgerPath,
  execution,
  report,
  allowedRoots,
  execute = args =>
    spawnSync('pnpm', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90 * 60_000,
    }),
  verifyCandidate,
}) {
  const value = validateProofExecutionPlan(report, execution, verifyCandidate);
  const commands = PROOF_COMMANDS[value.lane];
  must(commands, 'heavy proof lane has no fixed executor');
  recordHeavyProofExecution({ ledgerPath, execution: value, allowedRoots });
  for (let index = 0; index < commands.length; index += 1) {
    const result = execute(commands[index]);
    if (result?.status !== 0) {
      return {
        commandIndex: index,
        exitCode: Number.isInteger(result?.status) ? result.status : null,
        lane: value.lane,
        runId: value.runId,
        status: 'failed',
      };
    }
  }
  return { lane: value.lane, runId: value.runId, status: 'succeeded' };
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
      allowedRoots,
    });
    stdout(canonicalJson({ evidenceKey: execution.evidenceKey, ...result }));
    return result.status === 'succeeded' ? 0 : 1;
  } catch (error) {
    stderr(`heavy proof execution was not recorded: ${error.message}\n`);
    return 1;
  }
}

export function assertHeavyProofExecution({ evidenceKey, ledger }) {
  must(KEY.test(evidenceKey ?? ''), 'heavy proof evidence key is invalid');
  must(ledger instanceof Set, 'heavy proof ledger is unavailable');
  must(!ledger.has(evidenceKey), 'duplicate heavy proof is forbidden');
  ledger.add(evidenceKey);
  return true;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runHeavyProofRecordCli();
}
