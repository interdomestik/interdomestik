import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MACHINE_ROLES, machineRole, sha256Hex } from '../verify-machine-marker.mjs';
import { parsePlatformUuid } from '../verify-machine-probe.mjs';
import { readTrustedMarker } from '../verify-machine-trust.mjs';
import { readBytes } from './bytes.mjs';
import {
  checkJobDirectory,
  hostCommand,
  protectedFile,
  readApproval,
  sign,
  writeArtifact,
} from './host.mjs';
import { checkManifest, MANIFEST_SHA256 } from './manifest.mjs';
import {
  captureInvocation,
  checkMacJob,
  dispatchM4,
  makeGrant,
  readInvocation,
  writeInvocation,
} from './m4-dispatch.mjs';
import { runnerDigest } from './m5.mjs';
import { checkReceipt } from './receipt.mjs';
import {
  assertEvidence,
  checkLiveAuthority,
  checkGitInputs,
  checkQueueJob,
  checkTicket,
  issueTicket,
  same,
} from './ticket.mjs';

function m4Approval() {
  const approval = readApproval();
  const marker = readTrustedMarker();
  assertEvidence(
    process.platform === 'darwin' &&
      marker.status === 'trusted' &&
      machineRole(marker.marker) === MACHINE_ROLES.m4 &&
      marker.sha256 === approval.m4MarkerSha256,
    'm4-marker'
  );
  return approval;
}

function authority(stage, approval, root, { repo, subject, attempt, ticketId }) {
  const resolver = protectedFile('gate-m4-context', approval.m4ResolverSha256).file;
  const snapshot = JSON.parse(
    hostCommand(resolver, [
      stage,
      approval.mode,
      root,
      repo,
      subject,
      attempt,
      ...(ticketId ? [ticketId] : []),
    ])
  );
  const current = checkLiveAuthority(snapshot, { repo, subject, attempt });
  if (ticketId) assertEvidence(snapshot.ticketId === ticketId, 'queue-ticket-changed');
  checkMacJob(stage, snapshot);
  return { identity: current, m5: snapshot.m5, macJobId: snapshot.macJobId };
}

function issue(root, repo, subject, attempt, output) {
  const approved = m4Approval();
  const uuid = parsePlatformUuid(
    hostCommand('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']).toString()
  );
  const marker = readTrustedMarker();
  assertEvidence(
    uuid &&
      marker.sha256 === approved.m4MarkerSha256 &&
      sha256Hex(uuid) === marker.marker.machine.hardware_uuid_sha256,
    'm4-hardware'
  );
  const { identity: current } = authority('queue', approved, root, { repo, subject, attempt });
  checkManifest(root, { historical: approved.mode === 'trial' });
  const git = checkGitInputs(root, current, true);
  const now = Date.now();
  const ticket = issueTicket(current, approved, git.lockfileSha256, now);
  checkTicket(ticket, approved, now, current);
  const bytes = Buffer.from(JSON.stringify(ticket));
  const signature = sign(bytes, 'm4');
  mkdirSync(output, { mode: 0o700 });
  writeArtifact(output, 'ticket.sig', signature);
  writeArtifact(output, 'ticket.json', bytes);
  const job = checkQueueJob({ repo, subject, attempt, ticketId: ticket.id });
  assertEvidence(
    same(authority('record', approved, root, job).identity, current),
    'queue-scope-changed'
  );
  console.log(JSON.stringify(job));
}

// The protected queue identifies the job before any collected bytes are read.
export function verifyComposition(
  root,
  directory,
  job,
  stage,
  mode = 'gate',
  deps = {
    approval: m4Approval,
    authority,
    checkManifest,
    checkReceipt,
    checkGitInputs,
    now: Date.now,
  }
) {
  job = checkQueueJob(job);
  const approved = deps.approval();
  assertEvidence(approved.mode === mode, 'approval-mode');
  const { identity: current, m5, macJobId } = deps.authority(stage, approved, root, job);
  deps.checkManifest(root, { historical: mode === 'trial' });
  const verified = deps.checkReceipt(directory, approved, deps.now(), current, undefined, job);
  const { ticket, receipt, receiptSha256 } = verified;
  assertEvidence(
    m5?.dispatcherExit === 0 && m5.runId === receipt.runId && m5.receiptSha256 === receiptSha256,
    'm5-dispatch-finish'
  );
  const git = deps.checkGitInputs(root, current, ['collect', 'dispatch'].includes(stage));
  assertEvidence(git.lockfileSha256 === ticket.lockfileSha256, 'lockfile-ticket');
  assertEvidence(deps.approval().sha256 === approved.sha256, 'approval-drift');
  checkTicket(ticket, approved, deps.now(), current);
  return {
    method: mode === 'trial' ? 'composed-trial' : 'composed',
    repo: current.repo,
    subject: current.subject,
    attempt: current.attempt,
    ticketId: ticket.id,
    macJobId,
    head: current.head,
    base: current.main,
    tree: current.tree,
    testedMerge: current.merge,
    lockfileSha256: git.lockfileSha256,
    markerSha256: approved.m4MarkerSha256,
    m5RunId: receipt.runId,
    m5ReceiptSha256: receiptSha256,
    m5FinishedAt: receipt.finishedAt,
    expiresAt: ticket.expiresAt,
  };
}

function queueJob(file) {
  assertEvidence(path.resolve(file) === file, 'queued-job-path');
  checkJobDirectory(path.dirname(file));
  return checkQueueJob(JSON.parse(readBytes(file, 16 * 1024)));
}

function launch(approval, args, signal) {
  signal.throwIfAborted();
  const file = protectedFile('gate-m4-runner', approval.m4LauncherSha256).file;
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', NODE_V8_COVERAGE: undefined },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const cancel = () => child.kill('SIGTERM');
    signal.addEventListener('abort', cancel, { once: true });
    child.once('error', reject);
    child.once('close', (code, killed) => {
      signal.removeEventListener('abort', cancel);
      if (killed) reject(new Error('m4-launch-signal'));
      else resolve(code ?? 1);
    });
  });
}

async function dispatch(root, jobFile, evidence, checkout, grantDir, records, captureDir, signal) {
  const approved = m4Approval();
  const job = queueJob(jobFile);
  assertEvidence(
    [checkout, grantDir, records, captureDir].every(file => path.resolve(file) === file),
    'm4-run-path'
  );
  checkJobDirectory(path.dirname(captureDir));
  const checkQueue = stage => {
    assertEvidence(m4Approval().sha256 === approved.sha256, 'approval-drift');
    const { identity: current } = authority(stage, approved, root, job);
    checkGitInputs(root, current, stage === 'dispatch');
    return current;
  };
  return dispatchM4({
    checkQueue,
    collect: stage => verifyComposition(root, evidence, job, stage, approved.mode),
    runFull: async () => {
      const { head, main, tree } = checkQueue('dispatch');
      console.log('M4 selected the full verification chain.');
      const exit = await launch(approved, ['full', checkout, head, main, tree], signal);
      signal.throwIfAborted();
      if (exit === 0) checkQueue('accept');
      return exit;
    },
    runComposed: async scope => {
      const grant = makeGrant(scope, job, approved.sha256, checkout);
      const bytes = Buffer.from(JSON.stringify(grant));
      const signature = sign(bytes, 'm4');
      mkdirSync(grantDir, { mode: 0o700 });
      writeArtifact(grantDir, 'grant.sig', signature);
      writeArtifact(grantDir, 'grant.json', bytes);
      for (const file of ['grant.sig', 'grant.json']) chmodSync(path.join(grantDir, file), 0o644);
      chmodSync(grantDir, 0o755);
      const exit = await launch(
        approved,
        ['composed', checkout, grantDir, JSON.stringify(job)],
        signal
      );
      return { exit, grant };
    },
    capture: (grant, exit) =>
      writeInvocation(captureDir, captureInvocation(records, grant, exit, sign)),
    signal,
  });
}

function checkedInvocation(root, jobFile, evidence, captureDir) {
  const job = queueJob(jobFile);
  const expected = verifyComposition(root, evidence, job, 'finish');
  checkJobDirectory(captureDir);
  const capture = readInvocation(captureDir, expected, job, m4Approval(), Date.now());
  assertEvidence(
    same(verifyComposition(root, evidence, job, 'finish'), expected),
    'm4-publish-drift'
  );
  return capture;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const abort = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => abort.abort());
  }
  try {
    if (command === 'digests' && args.length === 0) {
      console.log(
        JSON.stringify({ manifestSha256: MANIFEST_SHA256, m5RunnerSha256: runnerDigest() })
      );
    } else if (command === 'issue' && args.length === 5) {
      issue(...args);
    } else if (['verify', 'trial-verify'].includes(command) && args.length === 3) {
      const [root, jobFile, evidence] = args;
      verifyComposition(
        root,
        evidence,
        queueJob(jobFile),
        'collect',
        command === 'trial-verify' ? 'trial' : 'gate'
      );
    } else if (command === 'dispatch' && args.length === 7) {
      process.exitCode = await dispatch(...args, abort.signal);
    } else if (command === 'publish' && args.length === 5) {
      writeInvocation(args[4], checkedInvocation(...args.slice(0, 4)));
    } else if (command === 'merge-check' && args.length === 4) {
      checkedInvocation(...args);
    } else {
      throw new Error('usage');
    }
  } catch {
    console.error('M4 composed evidence refused.');
    process.exitCode = 1;
  }
}
