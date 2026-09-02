import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';
import {
  canonicalize,
  canonicalJson,
  compareText,
  deriveEvidenceIdentityKey,
  exactKeys,
  must,
  sortedText,
} from './slice-rehearse-canonical.mjs';
export { deriveEvidenceIdentityKey, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const RECEIPT_KEYS =
  'commandDigest expiresAt headSha lane status substrateDigest treeSha workflowDigest writerMapDigest'.split(
    ' '
  );
const IDENTITY_KEYS =
  'commandDigest headSha substrateDigest treeSha workflowDigest writerMapDigest'.split(' ');
const LANE_PATTERN = /^[a-z0-9][a-z0-9:_-]*$/u;
const TRUSTED_REUSE_LANES = new Set(['pr-e2e']);
const VERIFIED_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const VERIFIED_KEYS = ['checkId', 'completedAt', 'key', 'provider', 'runId'];
const EXECUTION_KEYS = ['evidenceKey', 'lane', 'runId', 'startedAt'];
const RECORD_KEYS = [...EXECUTION_KEYS, 'exitCode', 'finishedAt', 'status'];
const PROOF_STATES = ['reserved', 'running', 'succeeded', 'failed'];
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const OPEN = fs.constants;
const openNoFollow = (path, flags) => fs.openSync(path, flags | OPEN.O_NOFOLLOW, 0o600);
function verifiedEvidenceSets(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([lane, records]) => LANE_PATTERN.test(lane) && Array.isArray(records))
      .map(([lane, records]) => {
        const entries = records
          .map(record => {
            try {
              must(
                record &&
                  typeof record === 'object' &&
                  !Array.isArray(record) &&
                  JSON.stringify(Object.keys(record).sort(compareText)) ===
                    JSON.stringify(VERIFIED_KEYS),
                'verified evidence record is invalid'
              );
              must(record.provider === 'github', 'verified evidence provider is invalid');
              must(DIGEST_PATTERN.test(record.key), 'verified evidence key is invalid');
              must(
                Number.isSafeInteger(record.checkId) &&
                  record.checkId > 0 &&
                  Number.isSafeInteger(record.runId) &&
                  record.runId > 0,
                'verified evidence identity is invalid'
              );
              const completedAt = Date.parse(record.completedAt);
              must(
                Number.isFinite(completedAt) &&
                  completedAt <= now + FUTURE_TOLERANCE_MS &&
                  now - completedAt <= VERIFIED_EVIDENCE_TTL_MS,
                'verified evidence is stale'
              );
              return [
                record.key,
                {
                  provenance: {
                    provider: record.provider,
                    checkId: record.checkId,
                    runId: record.runId,
                    completedAt: record.completedAt,
                  },
                  evaluatedAt: new Date(now).toISOString(),
                  expiresAt: new Date(completedAt + VERIFIED_EVIDENCE_TTL_MS).toISOString(),
                },
              ];
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const keys = entries.map(([key]) => key);
        return [lane, new Map(new Set(keys).size === keys.length ? entries : [])];
      })
  );
}
function validateEvidenceReceipt(receipt) {
  must(
    receipt && typeof receipt === 'object' && !Array.isArray(receipt),
    'evidence receipt invalid'
  );
  exactKeys(receipt, RECEIPT_KEYS, 'evidence receipt');
  must(SHA_PATTERN.test(receipt.headSha), 'evidence head SHA is invalid');
  must(SHA_PATTERN.test(receipt.treeSha), 'evidence tree SHA is invalid');
  must(
    typeof receipt.lane === 'string' && LANE_PATTERN.test(receipt.lane),
    'evidence lane is invalid'
  );
  for (const key of ['commandDigest', 'workflowDigest', 'substrateDigest', 'writerMapDigest']) {
    must(DIGEST_PATTERN.test(receipt[key]), `evidence ${key} is invalid`);
  }
  must(receipt.status === 'success', 'evidence receipt must be successful');
  const expiresAt = Date.parse(receipt.expiresAt);
  must(Number.isFinite(expiresAt), 'evidence expiry is invalid');
  return expiresAt;
}
export function deriveEvidenceKey(receipt, now = Date.now()) {
  const expiresAt = validateEvidenceReceipt(receipt);
  must(expiresAt > now, 'evidence receipt is expired');
  return deriveEvidenceIdentityKey(receipt);
}
export function evaluateEvidenceReceipts({
  receipts,
  heavyLanes,
  expectedByLane,
  verifiedEvidenceKeysByLane = {},
  dirtyWriterPaths,
  now = Date.now(),
}) {
  must(Array.isArray(receipts), 'evidence receipts must be an array');
  must(Array.isArray(heavyLanes), 'heavy lanes must be an array');
  must(new Set(heavyLanes).size === heavyLanes.length, 'heavy lanes must be unique');
  must(
    heavyLanes.every(lane => LANE_PATTERN.test(lane)),
    'heavy lane is invalid'
  );
  must(
    expectedByLane && typeof expectedByLane === 'object' && !Array.isArray(expectedByLane),
    'expected lane evidence identity is invalid'
  );
  must(Array.isArray(dirtyWriterPaths), 'dirty writer paths must be an array');
  const verified = verifiedEvidenceSets(verifiedEvidenceKeysByLane, now);

  const required = sortedText(heavyLanes);
  for (const lane of required) {
    const identity = expectedByLane[lane];
    must(
      identity && typeof identity === 'object',
      `expected evidence identity is missing: ${lane}`
    );
    must(SHA_PATTERN.test(identity.headSha), `expected evidence head SHA is invalid: ${lane}`);
    must(SHA_PATTERN.test(identity.treeSha), `expected evidence tree SHA is invalid: ${lane}`);
    for (const key of ['commandDigest', 'workflowDigest', 'substrateDigest', 'writerMapDigest']) {
      must(DIGEST_PATTERN.test(identity[key]), `expected evidence ${key} is invalid: ${lane}`);
    }
  }
  const seenLanes = new Set();
  const orderedReceipts = [...receipts].sort((left, right) =>
    compareText(canonicalJson(left), canonicalJson(right))
  );
  const decisions = orderedReceipts.map(receipt => {
    let key;
    let expiresAt;
    try {
      expiresAt = validateEvidenceReceipt(receipt);
      key = deriveEvidenceIdentityKey(receipt);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        lane: typeof receipt?.lane === 'string' ? receipt.lane : null,
        key: null,
        reusable: false,
        reason,
      };
    }
    let reason = 'manifest_receipt_untrusted';
    if (!required.includes(receipt.lane)) reason = 'lane_not_required';
    else if (dirtyWriterPaths.length > 0) reason = 'dirty_writer';
    else if (
      IDENTITY_KEYS.some(
        identityKey => receipt[identityKey] !== expectedByLane[receipt.lane][identityKey]
      )
    ) {
      reason = 'identity_mismatch';
    } else if (seenLanes.has(receipt.lane)) reason = 'duplicate_lane';
    else if (TRUSTED_REUSE_LANES.has(receipt.lane) && verified[receipt.lane]?.has(key)) {
      reason = 'independently_verified';
    } else if (expiresAt <= now) reason = 'evidence receipt is expired';
    if (['manifest_receipt_untrusted', 'independently_verified'].includes(reason)) {
      seenLanes.add(receipt.lane);
    }
    const verifiedRecord = verified[receipt.lane]?.get(key);
    return {
      lane: receipt.lane,
      key,
      reusable: reason === 'independently_verified',
      reason,
      ...(reason === 'independently_verified' ? verifiedRecord : {}),
    };
  });
  const reusableLanes = decisions
    .filter(decision => decision.reusable)
    .map(decision => decision.lane)
    .sort(compareText);
  return {
    decisions,
    reusableLanes,
    missingLanes: required.filter(lane => !reusableLanes.includes(lane)),
  };
}

export function normalizeHeavyProofExecution(execution) {
  exactKeys(execution, EXECUTION_KEYS, 'heavy proof execution');
  must(DIGEST_PATTERN.test(execution.evidenceKey ?? ''), 'heavy proof evidence key is invalid');
  must(RUN_ID_PATTERN.test(execution.runId ?? ''), 'heavy proof run ID is invalid');
  must(LANE_PATTERN.test(execution.lane ?? ''), 'heavy proof lane is invalid');
  must(Number.isFinite(Date.parse(execution.startedAt)), 'heavy proof start time is invalid');
  return execution;
}

function normalizeHeavyProofRecord(record) {
  exactKeys(record, RECORD_KEYS, 'heavy proof receipt');
  normalizeHeavyProofExecution(Object.fromEntries(EXECUTION_KEYS.map(key => [key, record[key]])));
  must(PROOF_STATES.includes(record.status), 'heavy proof receipt status is invalid');
  const terminal = ['succeeded', 'failed'].includes(record.status);
  must(
    terminal === Number.isFinite(Date.parse(record.finishedAt)),
    'heavy proof completion time is invalid'
  );
  must(
    terminal
      ? record.exitCode === null || Number.isInteger(record.exitCode)
      : record.exitCode === null,
    'heavy proof exit code is invalid'
  );
  must(
    record.status !== 'succeeded' || record.exitCode === 0,
    'successful proof exit code is invalid'
  );
  return record;
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
  status = 'reserved',
  finishedAt = null,
  exitCode = null,
  allowedRoots = [process.cwd(), tmpdir(), '/private/tmp'],
}) {
  const normalizedPath = trustedLedgerPath(ledgerPath, allowedRoots);
  const lockPath = `${normalizedPath}.lock`;
  let lock;
  try {
    lock = openNoFollow(lockPath, OPEN.O_WRONLY | OPEN.O_CREAT | OPEN.O_EXCL);
    let records = [];
    if (fs.existsSync(normalizedPath)) {
      const descriptor = openNoFollow(normalizedPath, OPEN.O_RDONLY);
      try {
        must(fs.fstatSync(descriptor).isFile(), 'heavy proof ledger must be a regular file');
        records = fs
          .readFileSync(descriptor, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => normalizeHeavyProofRecord(JSON.parse(line)));
      } finally {
        fs.closeSync(descriptor);
      }
    }
    const value = normalizeHeavyProofExecution(execution);
    const record = normalizeHeavyProofRecord({ ...value, status, finishedAt, exitCode });
    const history = records.filter(item => item.evidenceKey === value.evidenceKey);
    const previous = history.at(-1);
    const validTransition = previous
      ? (previous.status === 'reserved' && status === 'running') ||
        (previous.status === 'running' && ['succeeded', 'failed'].includes(status))
      : status === 'reserved';
    must(
      validTransition && (!previous || previous.runId === value.runId),
      'heavy proof receipt transition is invalid'
    );
    const descriptor = openNoFollow(normalizedPath, OPEN.O_WRONLY | OPEN.O_APPEND | OPEN.O_CREAT);
    try {
      fs.writeSync(descriptor, `${JSON.stringify(canonicalize(record))}\n`, null, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    return true;
  } finally {
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  }
}
