import fs from 'node:fs';
import path from 'node:path';
import { types } from 'node:util';
import {
  canonicalJson,
  exactKeys,
  must,
  readBoundedRegularText,
  sha256,
} from './slice-rehearse-canonical.mjs';
import {
  assertRecoveryContext,
  readRecoveryOperationEvidence,
} from './lean-current-authority-recovery.mjs';
import { recoveryOutcome } from './slice-rehearse-operation-live.mjs';
import {
  buildSafeOperation,
  recoveryApprovalBinding,
  recoveryIntent,
} from './slice-rehearse-operation-certificate.mjs';

const O = fs.constants;
const hash = value => sha256(canonicalJson(value));
const outcomes = ['applied', 'not_applied', 'unknown'];
function secureDirectory(root) {
  const s = fs.lstatSync(root);
  must(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === process.getuid() &&
      (s.mode & 0o777) === 0o700,
    'recovery directory unsafe'
  );
}
function syncDirectory(root) {
  const fd = fs.openSync(root, O.O_RDONLY | O.O_NOFOLLOW);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function writeRecord(file, record, claim) {
  const temp = `${file}.${claim}.tmp`;
  const fd = fs.openSync(temp, O.O_WRONLY | O.O_CREAT | O.O_EXCL | O.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, `${canonicalJson(record)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
  syncDirectory(path.dirname(file));
}
function readRecord(file, intent) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { schemaVersion: 1, intent, attempts: [] };
  must(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o600,
    'recovery record unsafe'
  );
  const value = JSON.parse(
    readBoundedRegularText(file, {
      label: 'Recovery record',
      maxBytes: 16 * 1024,
      allowedRoots: [path.dirname(file)],
    })
  );
  exactKeys(value, ['schemaVersion', 'intent', 'attempts'], 'recovery record');
  must(
    value.schemaVersion === 1 &&
      value.intent === intent &&
      Array.isArray(value.attempts) &&
      value.attempts.length > 0 &&
      value.attempts.length <= 16,
    'recovery record invalid'
  );
  for (const item of value.attempts) {
    exactKeys(item, ['attemptSha256', 'execution', 'outcome', 'quarantined'], 'recovery attempt');
    must(typeof item.quarantined === 'boolean', 'recovery quarantine invalid');
    must(
      /^[a-f0-9]{64}$/u.test(item.attemptSha256) && outcomes.includes(item.outcome),
      'recovery attempt invalid'
    );
    exactKeys(
      item.execution,
      ['baseSha', 'headSha', 'treeSha', 'remoteHeadSha'],
      'recovery identity'
    );
    must(
      Object.values(item.execution).every(v => typeof v === 'string' && /^[a-f0-9]{40}$/u.test(v)),
      'recovery identity invalid'
    );
  }
  return value;
}

export function runRecoveryOperation(request, command, options) {
  const { recovery, root, verifyApproval, verifyCurrent, reconcile } = options;
  exactKeys(
    recovery,
    ['context', 'approvedRequest', 'executeConditional', 'reconcilePrior'],
    'trusted recovery options'
  );
  must(typeof recovery.executeConditional === 'function', 'conditional adapter required');
  must(
    !types.isAsyncFunction(recovery.executeConditional),
    'synchronous conditional adapter required'
  );
  must(typeof recovery.reconcilePrior === 'function', 'prior reconciliation required');
  must(
    request.operation === 'conditional_merge' && command.certificate.workClass === 'product',
    'recovery operation unsupported'
  );
  const c = structuredClone(command.certificate);
  const approved = buildSafeOperation(structuredClone(recovery.approvedRequest)).certificate;
  must(
    recovery.approvedRequest.operation === request.operation,
    'recovery approved operation differs'
  );
  const semantic = recoveryApprovalBinding(approved);
  must(semantic === recoveryApprovalBinding(c), 'recovery semantic approval differs');
  const current = () =>
    readRecoveryOperationEvidence(
      recovery.context,
      c,
      approved,
      semantic,
      verifyApproval,
      verifyCurrent
    );
  assertRecoveryContext(recovery.context);
  verifyApproval(approved);
  secureDirectory(root);
  const legacy = () =>
    must(
      !fs
        .readdirSync(root)
        .some(name => name.startsWith(`${c.sliceId}-DELIVERY-`) && name.endsWith('.consumed')),
      'unlinked legacy consumption blocks recovery'
    );
  legacy();
  const directory = path.join(root, 'recovery-v1');
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
    syncDirectory(root);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  secureDirectory(directory);
  // Same logical PR merge across attempts/approval revisions; execution identity is not the key.
  const intent = recoveryIntent(c);
  const requestSha256 = hash(request),
    file = path.join(directory, `${intent}.json`);
  const claimPath = path.join(directory, `${intent}.claim`);
  const fd = fs.openSync(claimPath, O.O_WRONLY | O.O_CREAT | O.O_EXCL | O.O_NOFOLLOW, 0o600);
  const claim = fs.fstatSync(fd);
  try {
    fs.writeFileSync(fd, `${requestSha256}\n`);
    fs.fsyncSync(fd);
    syncDirectory(directory);
    const record = readRecord(file, intent),
      prior = record.attempts.at(-1);
    must(!prior?.quarantined, 'async outcome remains quarantined');
    if (prior && prior.outcome !== 'not_applied') {
      if (prior.outcome !== 'applied') {
        const result = recoveryOutcome(recovery.reconcilePrior(structuredClone(prior)));
        must(result.attemptSha256 === prior.attemptSha256, 'prior reconciliation identity differs');
        must(result.outcome !== 'unknown', 'prior outcome unknown');
        prior.outcome = result.outcome;
        writeRecord(file, record, requestSha256);
      }
      if (prior.outcome === 'applied') {
        return {
          status: 'already_applied',
          appliedExecution: structuredClone(prior.execution),
          matchesRequestedExecution:
            canonicalJson(prior.execution) ===
            canonicalJson({
              baseSha: c.baseSha,
              headSha: c.headSha,
              treeSha: c.treeSha,
              remoteHeadSha: c.expectedRemoteHeadSha,
            }),
          authorityGranted: false,
          command,
          reconciliation: { outcome: 'applied', attemptSha256: prior.attemptSha256 },
        };
      }
    }
    const initial = current();
    must(record.attempts.length < 16, 'recovery attempt bound exceeded');
    const attemptSha256 = hash({ intent, requestSha256, ordinal: record.attempts.length + 1 });
    const attempt = {
      attemptSha256,
      execution: initial.execution,
      outcome: 'unknown',
      quarantined: false,
    };
    record.attempts.push(attempt);
    writeRecord(file, record, attemptSha256);
    // Recheck after claim/reconciliation/persistence; no stale decision gets a refreshed CAS.
    legacy();
    must(hash(current()) === hash(initial), 'recovery observation changed before effect');
    let error = null;
    try {
      const result = recovery.executeConditional(structuredClone(command), {
        ...structuredClone(initial),
        attemptSha256,
      });
      attempt.quarantined = Boolean(result && typeof result.then === 'function');
      if (types.isPromise(result)) result.catch(() => {});
      must(!attempt.quarantined, 'synchronous conditional adapter required');
    } catch (caught) {
      error = caught;
    }
    let result = { outcome: 'unknown' };
    try {
      if (!attempt.quarantined) result = recoveryOutcome(reconcile(request, c, { attemptSha256 }));
    } catch {
      /* Preserve unknown durably. */
    }
    attempt.outcome = result.outcome;
    writeRecord(file, record, attemptSha256);
    return {
      status: result.outcome === 'applied' ? 'succeeded' : `failed_${result.outcome}`,
      command,
      reconciliation: result,
      error: error?.message ?? null,
    };
  } finally {
    fs.closeSync(fd);
    const now = fs.lstatSync(claimPath);
    must(
      now.ino === claim.ino && now.dev === claim.dev && !now.isSymbolicLink(),
      'recovery claim changed'
    );
    fs.unlinkSync(claimPath);
    syncDirectory(directory);
  }
}
