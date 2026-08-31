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

import { canonicalize, compareText, exactKeys, must } from './slice-rehearse-canonical.mjs';
import { canonicalJson, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';

const KEY = /^[0-9a-f]{64}$/u;

export function planInvalidatedProofs({ requiredLanes, decisions, now = Date.now() }) {
  must(Array.isArray(requiredLanes) && requiredLanes.length > 0, 'required lanes are unavailable');
  must(Array.isArray(decisions), 'proof decisions are unavailable');
  const required = [...requiredLanes].sort(compareText);
  must(new Set(required).size === required.length, 'required lanes must be unique');
  const byLane = new Map();
  for (const decision of decisions) {
    must(typeof decision?.lane === 'string', 'lane decision is invalid');
    must(!byLane.has(decision.lane), 'lane decision must be unique');
    must(typeof decision.reusable === 'boolean', 'lane decision is invalid');
    if (decision.key !== null) must(KEY.test(decision.key), 'evidence key is invalid');
    if (decision.reusable) {
      must(Number.isFinite(Date.parse(decision.expiresAt)), 'reusable evidence expiry is invalid');
    }
    byLane.set(decision.lane, decision);
  }
  const reuse = required.filter(lane => {
    const decision = byLane.get(lane);
    return decision?.reusable === true && Date.parse(decision.expiresAt) > now;
  });
  return { reuse, run: required.filter(lane => !reuse.includes(lane)) };
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

function parseRecordArgs(argv) {
  must(
    argv.length === 4 && argv[0] === '--execution' && argv[2] === '--ledger',
    'usage: --execution <path> --ledger <path>'
  );
  must(argv[1] && argv[3], 'usage: --execution <path> --ledger <path>');
  return { executionPath: argv[1], ledgerPath: argv[3] };
}

export function runHeavyProofRecordCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value),
} = {}) {
  try {
    const { executionPath, ledgerPath } = parseRecordArgs(argv);
    const allowedRoots = [cwd, tmpdir(), '/private/tmp'];
    const execution = JSON.parse(
      readBoundedRegularText(resolve(cwd, executionPath), {
        label: 'Heavy proof execution',
        maxBytes: 16 * 1024,
        allowedRoots,
      })
    );
    recordHeavyProofExecution({
      ledgerPath: resolve(cwd, ledgerPath),
      execution,
      allowedRoots,
    });
    stdout(
      canonicalJson({
        evidenceKey: execution.evidenceKey,
        lane: execution.lane,
        recorded: true,
        runId: execution.runId,
      })
    );
    return 0;
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
