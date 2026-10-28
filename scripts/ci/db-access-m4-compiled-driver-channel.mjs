import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// Owns the ChildProcess and its IPC transport. No caller-supplied message/channel is accepted.
export function executeM4CompiledDriver({ root, input, deadlineAt }) {
  const remaining = Math.floor(deadlineAt - performance.now());
  if (!Number.isSafeInteger(remaining) || remaining < 1 || remaining > 300000)
    throw Error('M4 compiled driver budget');
  return new Promise((resolve, reject) => {
    const nonce = randomBytes(32).toString('hex');
    const child = fork(path.join(root, 'db-access-m4-compiled-driver.mjs'), [], {
      cwd: root,
      execPath: process.execPath,
      execArgv: ['--disable-sigusr1'],
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        PATH: '/usr/bin:/bin',
        HOME: path.join(root, 'home'),
        TMPDIR: path.join(root, 'tmp'),
        TZ: 'UTC',
        LANG: 'C',
        NODE_ENV: 'production',
      },
    });
    let phase = 'spawned',
      completion,
      failure,
      disconnected = false,
      exitCode,
      exitSignal,
      outputBytes = 0;
    function refuse(reason) {
      failure ??= Error('M4 compiled driver channel refused: ' + reason);
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') failure = Error('M4 compiled owned process termination failed');
      }
    }
    const timer = setTimeout(() => refuse('deadline'), remaining);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', bytes => {
        outputBytes += bytes.length;
        if (outputBytes > 1024 * 1024) refuse('diagnostic bound');
        // stdout/stderr are diagnostic bytes only; never parse them as evidence.
      });
    child.on('error', () => refuse('process error'));
    child.on('message', message => {
      try {
        if (
          !message ||
          Buffer.byteLength(JSON.stringify(message)) > 2 * 1024 * 1024 ||
          message.pid !== child.pid
        )
          throw Error('sender/bound');
        const keys = Object.keys(message).sort().join('|');
        if (
          phase === 'spawned' &&
          message.type === 'M4_COMPILED_DRIVER_READY' &&
          keys === 'pid|type'
        ) {
          phase = 'running';
          child.send(
            {
              type: 'M4_COMPILED_DRIVER_START',
              nonce,
              pid: child.pid,
              parentPid: process.pid,
              remainingMs: Math.floor(deadlineAt - performance.now()),
              input,
            },
            error => {
              if (error) refuse('startup send');
            }
          );
        } else if (
          phase === 'running' &&
          message.type === 'M4_COMPILED_DRIVER_COMPLETE' &&
          keys === 'nonce|pid|result|type' &&
          message.nonce === nonce
        ) {
          completion = structuredClone(message.result);
          phase = 'completed';
        } else if (
          phase === 'completed' &&
          message.type === 'M4_COMPILED_DRIVER_CLOSED' &&
          keys === 'nonce|pid|type' &&
          message.nonce === nonce
        ) {
          phase = 'closed';
        } else throw Error('sequence/nonce');
      } catch {
        refuse('message identity or sequence');
      }
    });
    child.on('disconnect', () => {
      disconnected = true;
      if (phase !== 'closed') refuse('missing explicit close');
    });
    child.on('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (
        failure ||
        !disconnected ||
        phase !== 'closed' ||
        exitCode !== 0 ||
        exitSignal ||
        code !== 0 ||
        signal ||
        performance.now() > deadlineAt
      ) {
        reject(failure ?? Error('M4 compiled driver channel refused: incomplete termination'));
      } else resolve(completion);
    });
  });
}
