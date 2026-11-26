import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { MACHINE_ROLES, sha256Hex } from '../verify-machine-marker.mjs';
import { readBytes } from './bytes.mjs';
import {
  checkJobDirectory,
  cleanHostEnv,
  hostCommand,
  protectedFile,
  readApproval,
  sign,
  signedDocument,
  writeArtifact,
} from './host.mjs';
import { checkManifest, DELEGATED, MANIFEST_SHA256, M5_SCRIPT } from './manifest.mjs';
import { probeSlot } from './machine.mjs';
import { checkPurity, INSTALL_LOG, JOB_LOG, PURITY_REPORT, RECEIPT_CLASS } from './receipt.mjs';
import { assertEvidence, checkTicket, same } from './ticket.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_ROOT = path.dirname(HERE);
const RUNNER_INPUTS = [
  'verification-evidence/bytes.mjs',
  'verification-evidence/host.mjs',
  'verification-evidence/m5.mjs',
  'verification-evidence/machine.mjs',
  'verification-evidence/manifest.mjs',
  'verification-evidence/receipt.mjs',
  'verification-evidence/ticket.mjs',
  'verify-machine-docker.mjs',
  'verify-machine-env.mjs',
  'verify-machine-env-files.mjs',
  'verify-machine-env-names.mjs',
  'verify-machine-exec.mjs',
  'verify-machine-marker.mjs',
  'verify-machine-probe.mjs',
  'verify-machine-trust.mjs',
];

export function runnerDigest() {
  return sha256Hex(
    JSON.stringify(
      RUNNER_INPUTS.map(file => [file, sha256Hex(readFileSync(path.join(VERIFY_ROOT, file)))])
    )
  );
}

function protectedWorker(approved) {
  protectedFile('worker-paths.mjs', approved.m5WorkerPathsSha256);
  return protectedFile('gate-m5-worker.mjs', approved.m5WorkerSha256).file;
}

function workerOptions([, cwd, PATH, bash]) {
  return { cwd, env: { ...cleanHostEnv, PATH, INTERDOMESTIK_M5_BASH: bash } };
}

// Only the supervisor owns the log descriptors. The worker gets pipes and clean credentials-free
// execution from the host bridge. The bridge drains the worker before each next step.
async function runWorker(worker, invocation, command, output, signal) {
  const child = spawn(process.execPath, [worker, 'run', ...invocation, '--', ...command], {
    ...workerOptions(invocation),
    stdio: ['ignore', 'pipe', 'pipe'],
    signal,
  });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, killed) => resolve({ code, killed }));
  });
  async function* outputBytes() {
    // The bridge forwards the worker's combined stream on stdout. Keep its stderr as well.
    const stderr = [];
    const diagnostics = (async () => {
      for await (const chunk of child.stderr) stderr.push(chunk);
    })();
    yield* child.stdout;
    await diagnostics;
    yield* stderr;
  }
  const log = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  try {
    const [exit] = await Promise.all([closed, pipeline(outputBytes(), log)]);
    return exit;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    hostCommand(process.execPath, [worker, 'drain', ...invocation], workerOptions(invocation));
  }
}

function auditWorker(worker, invocation, stage, probe) {
  const audit = JSON.parse(
    hostCommand(
      process.execPath,
      [worker, 'audit', ...invocation, stage],
      workerOptions(invocation)
    )
  );
  assertEvidence(
    audit.isolated === true &&
      audit.processesDrained === true &&
      audit.gitReadOnly === true &&
      audit.trackedReadOnly === true &&
      (stage !== 'start' || audit.freshDependencies === true) &&
      same(audit.executables, probe.executables) &&
      audit.bash === probe.bash &&
      audit.node === probe.node &&
      audit.pnpm === probe.pnpm,
    'worker-isolation'
  );
}

function nativeReport(root, report, startedAt, finishedAt, output) {
  const file = path.join(root, report);
  assertEvidence(realpathSync(file) === file, 'report-path');
  const bytes = readBytes(file);
  checkPurity(bytes, startedAt, finishedAt);
  writeArtifact(output, PURITY_REPORT, bytes);
  return sha256Hex(bytes);
}

export async function runEvidence(input, checkout, output, signal) {
  const approved = readApproval();
  const worker = protectedWorker(approved);
  const runnerSha256 = runnerDigest();
  assertEvidence(runnerSha256 === approved.m5RunnerSha256, 'runner-digest');
  checkManifest(path.resolve(VERIFY_ROOT, '../..'));
  const {
    value: ticket,
    bytes: ticketBytes,
    signature: ticketSignature,
  } = signedDocument(input, 'ticket', 'm4', approved);
  const startedAt = Date.now();
  checkTicket(ticket, approved, startedAt);
  assertEvidence(
    realpathSync(checkout) === checkout && path.resolve(output) === output,
    'job-path'
  );
  checkManifest(checkout, { historical: approved.mode === 'trial' });
  mkdirSync(output, { mode: 0o700 });
  checkJobDirectory(output);
  writeArtifact(output, 'ticket.json', ticketBytes);
  writeArtifact(output, 'ticket.sig', ticketSignature);

  const runId = randomUUID();
  const start = await probeSlot(checkout, ticket, approved, 'start');
  const invocation = [ticket.id, checkout, start.toolPath, start.executables.bash];
  auditWorker(worker, invocation, 'start', start);
  const { packageManager } = JSON.parse(readFileSync(path.join(checkout, 'package.json'), 'utf8'));
  assertEvidence(packageManager === `pnpm@${start.pnpm}`, 'package-manager');
  const job = createWriteStream(path.join(output, JOB_LOG), { flags: 'wx', mode: 0o600 });
  let jobError;
  job.on('error', error => {
    jobError = error;
  });
  const lanes = [];
  let active = { id: 'install' };
  const step = async (id, command, log) => {
    signal?.throwIfAborted();
    active = { id, command };
    const file = path.join(output, log);
    const result = await runWorker(worker, invocation, command, file, signal);
    Object.assign(active, { exit: result.code, signal: result.killed });
    const bytes = readBytes(file);
    if (jobError) throw jobError;
    await new Promise((resolve, reject) => {
      job.write(Buffer.concat([Buffer.from(`\n=== ${id} ===\n`), bytes]), error =>
        error ? reject(error) : resolve()
      );
    });
    assertEvidence(result.code === 0 && !result.killed, 'm5-step-exit');
    return sha256Hex(bytes);
  };
  const runLanes = async (index = 0) => {
    if (index === DELEGATED.length) return;
    const [, id, command, report] = DELEGATED[index];
    signal?.throwIfAborted();
    auditWorker(worker, invocation, 'installed', start);
    const startedAt = Date.now();
    if (report) assertEvidence(!existsSync(path.join(checkout, report)), 'report-already-present');
    const transcript = `${id}.log`;
    const reports = { [transcript]: await step(id, command.split(' '), transcript) };
    const finishedAt = Date.now();
    if (report)
      reports[PURITY_REPORT] = nativeReport(checkout, report, startedAt, finishedAt, output);
    lanes.push({ id, command, startedAt, finishedAt, exit: 0, reports });
    return runLanes(index + 1);
  };
  try {
    const installLogSha256 = await step(
      'install',
      [
        'pnpm',
        'install',
        '--frozen-lockfile',
        '--store-dir',
        path.join(checkout, 'tmp/m5-pnpm-store'),
      ],
      INSTALL_LOG
    );
    await runLanes();
    await new Promise((resolve, reject) => {
      job.once('error', reject);
      job.end(resolve);
    });
    const finish = await probeSlot(checkout, ticket, approved, 'finish');
    auditWorker(worker, invocation, 'finish', finish);
    assertEvidence(
      same(start, finish) && readApproval().sha256 === approved.sha256,
      'm5-probe-drift'
    );
    protectedWorker(approved);
    assertEvidence(runnerDigest() === runnerSha256, 'runner-drift');
    const finishedAt = Date.now();
    checkTicket(ticket, approved, finishedAt);
    const receipt = Buffer.from(
      JSON.stringify({
        class: RECEIPT_CLASS,
        machineRole: MACHINE_ROLES.m5,
        completed: true,
        exit: 0,
        runId,
        ticket,
        ticketSha256: sha256Hex(ticketBytes),
        runnerSha256,
        manifestSha256: MANIFEST_SHA256,
        startedAt,
        finishedAt,
        start,
        finish,
        lanes,
        installLogSha256,
        logSha256: sha256Hex(readBytes(path.join(output, JOB_LOG))),
      })
    );
    const signature = sign(receipt, 'm5');
    await setImmediate();
    signal?.throwIfAborted();
    writeArtifact(output, 'receipt.sig', signature);
    writeArtifact(output, 'receipt.json', receipt);
  } catch (error) {
    job.destroy();
    writeArtifact(output, 'failure.json', JSON.stringify({ runId, active, completed: false }));
    throw error;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const abort = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => abort.abort());
  }
  try {
    assertEvidence(
      process.env.npm_lifecycle_event === M5_SCRIPT && process.argv.length === 5,
      'm5-command'
    );
    await runEvidence(...process.argv.slice(2), abort.signal);
  } catch {
    console.error('M5 delegated evidence failed. See the private job directory.');
    process.exitCode = 1;
  }
}
