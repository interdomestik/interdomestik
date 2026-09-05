import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { canonicalize, exactKeys, must } from './slice-rehearse-canonical.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';

const [SLICE, SHA] = [/^[A-Z0-9][A-Z0-9-]{1,63}$/u, /^[0-9a-f]{40}$/u];
const DIGEST = /^[0-9a-f]{64}$/u;
const LANE = /^[a-z0-9][a-z0-9:_-]*$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const EXECUTION_KEYS = ['evidenceKey', 'lane', 'runId', 'startedAt'];
const RECORD_KEYS = [...EXECUTION_KEYS, 'exitCode', 'finishedAt', 'status'];
const OPEN = fs.constants;
const conflict = (item, run) =>
  item.runId === run.runId || ['succeeded', 'unknown', 'running', 'reserved'].includes(item.status);
const openNoFollow = (path, flags) => fs.openSync(path, flags | OPEN.O_NOFOLLOW, 0o600);
export const HEAVY_PROOF_LEDGER_ROOT = resolve(
  homedir(),
  '.codex/state/interdomestik/harness-proof-ledgers'
);

function secureRoot(root, label, optional = false) {
  if (!fs.existsSync(root)) {
    must(optional, `${label} is unavailable`);
    return false;
  }
  const stat = fs.lstatSync(root);
  const secure =
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    (stat.mode & 0o777) === 0o700 &&
    stat.uid === process.getuid();
  must(secure, `${label} root is unsafe`);
  return true;
}

function syncDirectory(root) {
  const fd = openNoFollow(root, OPEN.O_RDONLY);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function heavyProofLedgerPath(scope, root = HEAVY_PROOF_LEDGER_ROOT) {
  must(SLICE.test(scope?.sliceId ?? ''), 'heavy proof slice ID is invalid');
  must(SHA.test(scope?.headSha ?? ''), 'heavy proof head SHA is invalid');
  must(SHA.test(scope?.treeSha ?? ''), 'heavy proof tree SHA is invalid');
  const file = `${scope.sliceId}-${scope.headSha}-${scope.treeSha}.jsonl`;
  return resolve(root, file);
}

export function trustedHeavyProofLedgerPath(ledgerPath, scope, root = HEAVY_PROOF_LEDGER_ROOT) {
  const expected = heavyProofLedgerPath(scope, root);
  must(
    resolve(ledgerPath) === expected,
    'heavy proof ledger is outside the canonical evidence scope'
  );
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    syncDirectory(dirname(root));
  }
  secureRoot(root, 'heavy proof ledger');
  return trustedRunnerFile(expected, { runnerTemp: root });
}

export function normalizeHeavyProofExecution(execution) {
  exactKeys(execution, EXECUTION_KEYS, 'heavy proof execution');
  must(DIGEST.test(execution.evidenceKey ?? ''), 'heavy proof evidence key is invalid');
  must(RUN_ID.test(execution.runId ?? ''), 'heavy proof run ID is invalid');
  must(LANE.test(execution.lane ?? ''), 'heavy proof lane is invalid');
  must(Number.isFinite(Date.parse(execution.startedAt)), 'heavy proof start time is invalid');
  return execution;
}

function normalizeHeavyProofRecord(record) {
  exactKeys(record, RECORD_KEYS, 'heavy proof receipt');
  const { exitCode: code, finishedAt, status, ...run } = record;
  normalizeHeavyProofExecution(run);
  must(
    ['reserved', 'running', 'succeeded', 'failed', 'cancelled', 'unknown'].includes(status),
    'heavy proof receipt status is invalid'
  );
  const terminal = ['succeeded', 'failed', 'cancelled', 'unknown'].includes(status);
  must(
    terminal
      ? typeof finishedAt === 'string' && Number.isFinite(Date.parse(finishedAt))
      : finishedAt === null,
    'proof completion invalid'
  );
  must(code === null || (terminal && Number.isInteger(code)), 'heavy proof exit code is invalid');
  must(status !== 'succeeded' || code === 0, 'success proof exit code invalid');
  return record;
}

function readProofRecords(path) {
  if (!fs.existsSync(path)) return [];
  const fd = openNoFollow(path, OPEN.O_RDONLY);
  try {
    const stat = fs.fstatSync(fd);
    must(
      stat.isFile() &&
        stat.nlink === 1 &&
        stat.uid === process.getuid() &&
        (stat.mode & 0o777) === 0o600 &&
        stat.size <= 512 * 1024,
      'proof ledger is unsafe or oversized'
    );
    const text = fs.readFileSync(fd, 'utf8');
    must(Buffer.byteLength(text) <= 512 * 1024, 'proof ledger oversized');
    must(!text || text.endsWith('\n'), 'ledger incomplete');
    return text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => normalizeHeavyProofRecord(JSON.parse(line)));
  } finally {
    fs.closeSync(fd);
  }
}

export function recordHeavyProofExecution({
  ledgerPath,
  scope,
  execution,
  status,
  finishedAt = null,
  exitCode = null,
  ledgerRoot,
}) {
  const path = trustedHeavyProofLedgerPath(ledgerPath, scope, ledgerRoot);
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = openNoFollow(lockPath, OPEN.O_WRONLY | OPEN.O_CREAT | OPEN.O_EXCL);
    const seen = readProofRecords(path);
    const run = normalizeHeavyProofExecution(execution);
    const record = normalizeHeavyProofRecord({ ...run, status, finishedAt, exitCode });
    must(
      finishedAt !== null &&
        !seen.some(item => item.runId === run.runId) &&
        (status !== 'succeeded' || !seen.some(item => conflict(item, run))),
      'receipt transition invalid'
    );
    const fd = openNoFollow(path, OPEN.O_WRONLY | OPEN.O_APPEND | OPEN.O_CREAT);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(canonicalize(record))}\n`);
      fs.fsyncSync(fd);
      syncDirectory(dirname(path));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } finally {
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  }
}

export function acquireHeavyProofExecutionLease({ ledgerPath, scope, execution, ledgerRoot }) {
  const path = trustedHeavyProofLedgerPath(ledgerPath, scope, ledgerRoot);
  const run = normalizeHeavyProofExecution(execution);
  const leasePath = `${path}.run.lock`;
  let fd;
  try {
    fd = openNoFollow(leasePath, OPEN.O_WRONLY | OPEN.O_CREAT | OPEN.O_EXCL);
    const seen = readProofRecords(path);
    must(!seen.some(record => conflict(record, run)), 'proof already succeeded or unresolved');
    must(seen.length < 4, 'proof retry budget exhausted');
    fs.writeFileSync(fd, `${JSON.stringify(canonicalize(run))}\n`);
    fs.fsyncSync(fd);
    syncDirectory(dirname(path));
  } catch (error) {
    if (fd !== undefined) {
      fs.closeSync(fd);
      fs.unlinkSync(leasePath);
    }
    throw error;
  }
  let done = false;
  return (preserve = false) => {
    must(!done, 'proof lease already released');
    done = true;
    fs.closeSync(fd);
    if (!preserve) {
      fs.unlinkSync(leasePath);
      syncDirectory(dirname(path));
    }
  };
}

export function readHeavyProofRecords(scope) {
  const path = heavyProofLedgerPath(scope);
  return fs.existsSync(path) ? readProofRecords(trustedHeavyProofLedgerPath(path, scope)) : [];
}
