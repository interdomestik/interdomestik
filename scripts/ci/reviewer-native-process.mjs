import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reviewerLifecycle } from './reviewer-process-lifecycle.mjs';
import { providerFailureReason } from './reviewer-route-utils.mjs';

// Revalidate the protocol deliberately whenever this native build changes.
export const EXECUTABLE_SHA256 = 'cabadc15a61944372bede1fdff186701c17467dd9d718e97dc79283055d3c101';
export const GOOGLE_TEAM = 'EQHXZ8M8AV';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function requireNative(condition, reason) {
  if (!condition) throw new Error(`native_${reason}`);
}

export function verifyExecutable(executable, env) {
  requireNative(
    process.platform === 'darwin' && path.isAbsolute(executable),
    'executable_untrusted'
  );
  requireNative(digest(fs.readFileSync(executable)) === EXECUTABLE_SHA256, 'executable_untrusted');
  try {
    execFileSync(
      '/usr/bin/codesign',
      [
        '--verify',
        '--strict',
        '-R',
        `=anchor apple generic and certificate leaf[subject.OU] = "${GOOGLE_TEAM}"`,
        executable,
      ],
      { env, timeout: 30_000, maxBuffer: 20_000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch {
    throw new Error('native_signature_unverified');
  }
}

export function prepareNativeExecutable(command) {
  // Preserve the existing subscription HOME, excluding API keys, proxy and loader overrides.
  const env = {
    HOME: os.homedir(),
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    TMPDIR: os.tmpdir(),
    LANG: 'en_US.UTF-8',
  };
  verifyExecutable(command, env);
  const evidenceDirectory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'native-reviewer-'))
  );
  const executable = path.join(evidenceDirectory, 'agy');
  // The private copy prevents ordinary updater/symlink races, not hostile same-UID/root processes.
  fs.copyFileSync(command, executable, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(executable, 0o500);
  verifyExecutable(executable, env);
  return { env, executable, evidenceDirectory };
}

export function nativeFailureReceipt(error, evidenceDirectory) {
  const record = error.record;
  const providerReason = record && providerFailureReason(`${record.stderr}\n${record.stdout}`);
  return {
    status: 'blocked',
    blockerReason:
      error.message === 'native_process_failed' && providerReason
        ? providerReason
        : error.message.startsWith('native_')
          ? error.message
          : 'native_preflight_failed',
    error: error.message,
    providerReportedModel: null,
    reviewVerdict: null,
    evidenceDirectory,
    commandInvoked: record?.argv ?? [],
    exitCode: record ? record.exitCode : 125,
    signal: record?.signal ?? null,
    stdout: record?.stdout ?? '',
    stderr: record?.stderr ?? '',
    firstOutputTimeout: {
      timedOut: error.message === 'native_no_output_timeout',
      timeoutMs: 300_000,
    },
    totalTimeout: { timedOut: error.message === 'native_total_timeout', timeoutMs: 600_000 },
  };
}

export function captureNative(executable, args, context) {
  verifyExecutable(executable, context.env);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: context.cwd,
      env: context.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const record = {
      pid: child.pid,
      argv: [
        executable,
        ...args.map((arg, index) => (args[index - 1] === '-p' ? '<prompt>' : arg)),
      ],
      cwd: context.cwd,
      startedAt: new Date().toISOString(),
      stdout: '',
      stderr: '',
    };
    const chunks = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let reason;
    const lifecycle = reviewerLifecycle(
      child,
      () => {
        reason ||= 'native_cancelled';
      },
      context.signal
    );
    const stop = value => {
      reason ||= value;
      lifecycle.stop();
    };
    const firstTimer = setTimeout(() => stop('native_no_output_timeout'), 300_000);
    const timer = setTimeout(
      () => stop('native_total_timeout'),
      Math.max(1, context.deadline - Date.now())
    );
    for (const channel of ['stdout', 'stderr'])
      child[channel].on('data', chunk => {
        clearTimeout(firstTimer);
        if (sizes[channel] + chunk.length > 512_000) stop('native_output_limit');
        else {
          chunks[channel].push(chunk);
          sizes[channel] += chunk.length;
        }
      });
    child.on('error', error => {
      reason ||= `native_spawn_error:${error.code}`;
    });
    child.on('close', (code, signal) => {
      const cleanupError = lifecycle.close();
      reason ||= cleanupError;
      clearTimeout(timer);
      clearTimeout(firstTimer);
      for (const channel of ['stdout', 'stderr'])
        record[channel] = Buffer.concat(chunks[channel]).toString('utf8');
      Object.assign(record, { exitCode: code, signal, endedAt: new Date().toISOString() });
      try {
        fs.writeFileSync(context.receiptPath, JSON.stringify(record, null, 2), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        reject(Object.assign(new Error(`native_receipt_write_failed:${error.code}`), { record }));
        return;
      }
      if (reason || code !== 0)
        reject(Object.assign(new Error(reason || 'native_process_failed'), { record }));
      else resolve(record);
    });
  });
}
