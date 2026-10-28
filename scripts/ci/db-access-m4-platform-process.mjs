import { spawn, execFileSync } from 'node:child_process';
import { remaining } from './db-access-m4-platform-custody.mjs';

// Every process remains a descendant in the trusted driver's group. No IPC FD is inherited.
// The whole-run guardian additionally owns that group; this module never claims an OS UID split.
function table() {
  return execFileSync('/bin/ps', ['-Ao', 'pid=,ppid=,lstart='], {
    encoding: 'utf8',
    timeout: 2000,
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' },
  })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const fields = line.trim().split(/\s+/u);
      return {
        pid: Number(fields[0]),
        parent: Number(fields[1]),
        start: fields.slice(2).join(' '),
      };
    });
}
export function launchOwned(command, deadlineAt) {
  // Refuse before creating a process if the host cannot observe owned descendants.
  table();
  const duration = remaining(deadlineAt);
  const child = spawn(command.argv[0], command.argv.slice(1), {
    cwd: command.cwd,
    env: command.env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let failure,
    stdout = '',
    stderr = '',
    terminal = false,
    closed = false,
    code,
    signal;
  const identities = new Map();
  let closeResolve;
  const drained = new Promise(resolve => {
    closeResolve = resolve;
  });
  function sample() {
    const rows = table(),
      selected = new Set([child.pid]);
    for (;;) {
      const more = rows.filter(row => selected.has(row.parent));
      const old = selected.size;
      more.forEach(row => selected.add(row.pid));
      if (old === selected.size) break;
    }
    for (const row of rows)
      if (selected.has(row.pid)) {
        const before = identities.get(row.pid);
        if (before && before !== row.start) throw Error('Owned process identity changed');
        identities.set(row.pid, row.start);
      }
    return rows;
  }
  function signalOwned(kind) {
    let rows;
    try {
      rows = sample();
    } catch {
      failure ??= Error('Process sampling failed');
      return;
    }
    for (const row of [...rows].reverse())
      if (identities.get(row.pid) === row.start) {
        try {
          process.kill(row.pid, kind);
        } catch (error) {
          if (error.code !== 'ESRCH') failure ??= Error('Owned termination failed');
        }
      }
  }
  const fail = message => {
    failure ??= Error(message);
    signalOwned('SIGKILL');
  };
  child.once('error', () => fail('Owned process launch failed'));
  child.once('exit', (value, why) => {
    code = value;
    signal = why;
    terminal = true;
  });
  for (const [stream, name] of [
    [child.stdout, 'stdout'],
    [child.stderr, 'stderr'],
  ])
    stream.on('data', bytes => {
      if (name === 'stdout') stdout += bytes.toString('utf8');
      else stderr += bytes.toString('utf8');
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 2 * 1024 * 1024)
        fail('Process diagnostic cap');
    });
  child.once('close', () => {
    closed = true;
    clearInterval(sampler);
    clearTimeout(timer);
    closeResolve();
  });
  const sampler = setInterval(() => {
    try {
      sample();
    } catch {
      fail('Owned sampler failed');
    }
  }, 100);
  const timer = setTimeout(() => fail('Owned process deadline'), duration);
  try {
    sample();
  } catch {
    fail('Initial owned sampler failed');
  }
  async function finish(expectZero = true) {
    await drained;
    const alive = table().filter(row => identities.get(row.pid) === row.start);
    if (alive.length) {
      signalOwned('SIGKILL');
      failure ??= Error('Owned descendants outlived root');
    }
    if (!terminal || !closed || (expectZero && (code !== 0 || signal)))
      failure ??= Error('Owned process failed');
    if (failure) throw failure;
    return {
      stdout,
      stderr,
      code,
      signal,
      pid: child.pid,
      drained: true,
      descendantsAbsent: true,
    };
  }
  let stopPromise;
  return Object.freeze({
    pid: child.pid,
    output: () => stdout,
    ended: () => terminal,
    wait: () => finish(true),
    stop: () =>
      (stopPromise ??= (async () => {
        if (!terminal) signalOwned('SIGTERM');
        const kill = setTimeout(() => signalOwned('SIGKILL'), 2000);
        try {
          return await finish(true);
        } finally {
          clearTimeout(kill);
        }
      })()),
  });
}
export async function runOwned(command, deadlineAt) {
  return launchOwned(command, deadlineAt).wait();
}
