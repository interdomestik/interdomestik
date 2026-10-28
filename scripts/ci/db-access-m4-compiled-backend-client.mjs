import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { m4CompiledBackendLaunch } from './db-access-m4-compiled-platform.mjs';

export function openM4CompiledBackend(root, platform, deadlineAt) {
  const launch = m4CompiledBackendLaunch(platform);
  const owned = fs.realpathSync(root);
  const remaining = Math.floor(deadlineAt - performance.now());
  if (!(remaining > 0 && remaining <= 300000)) throw Error('Compiled backend deadline');
  const child = fork(path.join(owned, 'db-access-m4-compiled-backend-child.mjs'), [], {
    cwd: owned,
    execPath: process.execPath,
    execArgv: ['--disable-sigusr1'],
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      PATH: '/usr/bin:/bin',
      HOME: path.join(owned, 'home'),
      TMPDIR: path.join(owned, 'tmp'),
      TZ: 'UTC',
      LANG: 'C',
      NODE_ENV: 'production',
      NODE_EXTRA_CA_CERTS: launch.caFile,
    },
  });
  let phase = 'empty',
    failure,
    origin,
    observation,
    closePromise,
    count = 0;
  let readyResolve, readyReject, exitResolve, opsResolve, opsReject, opsPromise;
  let opsUsed = false;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  ready.catch(() => {});
  const exited = new Promise(resolve => {
    exitResolve = resolve;
  });
  function refuse() {
    failure ??= new Error('M4 compiled backend execution failed');
    readyReject(failure);
    opsReject?.(failure);
    try {
      child.kill('SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') failure = new Error('M4 compiled backend termination failed');
    }
  }
  const timer = setTimeout(refuse, remaining);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', bytes => {
      count += bytes.length;
      if (count > 1024 * 1024) refuse(); // No child diagnostics/credentials enter accepted evidence.
    });
  child.on('error', refuse);
  child.on('message', value => {
    try {
      if (Buffer.byteLength(JSON.stringify(value)) > 256 * 1024) throw Error();
      if (
        phase === 'starting' &&
        value?.kind === 'ready' &&
        Object.keys(value).sort().join('|') === 'kind|origin'
      ) {
        const parsed = new URL(value.origin);
        if (
          parsed.protocol !== 'https:' ||
          parsed.hostname !== '127.0.0.1' ||
          !parsed.port ||
          parsed.pathname !== '/' ||
          parsed.search ||
          parsed.hash ||
          parsed.username ||
          parsed.password
        )
          throw Error();
        origin = parsed.origin;
        phase = 'started';
        readyResolve(origin);
      } else if (
        phase === 'started' &&
        opsUsed &&
        opsResolve &&
        value?.kind === 'ops-complete' &&
        Object.keys(value).sort().join('|') === 'kind|record'
      ) {
        opsResolve(value.record);
        opsResolve = undefined;
      } else if (
        phase === 'closing' &&
        value?.kind === 'closed' &&
        Object.keys(value).sort().join('|') === 'kind|observation|ownerInstanceId'
      ) {
        if (!/^[a-f0-9-]{36}$/u.test(value.ownerInstanceId)) throw Error();
        observation = {
          ...value.observation,
          ownerInstanceId: value.ownerInstanceId,
        };
        phase = 'closed';
      } else throw Error();
    } catch {
      refuse();
    }
  });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    if (code !== 0 || signal || phase !== 'closed') {
      failure ??= new Error('M4 compiled backend failed to close and exit');
      readyReject(failure);
      opsReject?.(failure);
    }
    exitResolve();
  });
  const close = () =>
    (closePromise ??= (async () => {
      if (phase === 'empty') refuse();
      try {
        await ready;
        if (opsPromise) await opsPromise;
        if (!failure && phase === 'started') {
          phase = 'closing';
          child.send({ command: 'close' }, error => {
            if (error) refuse();
          });
        }
      } catch {
        refuse();
      }
      await exited;
      if (failure) throw failure;
      return observation;
    })());
  return Object.freeze({
    createProfiles(configuration) {
      if (phase !== 'empty') throw Error('One literal compiled owner required');
      phase = 'starting';
      child.send(
        {
          command: 'start',
          configuration: {
            runtime: configuration,
            tls: launch.tls,
            host: '127.0.0.1',
            port: 0,
            relayDeadlineMs: 15000,
          },
        },
        error => {
          if (error) refuse();
        }
      );
      return Object.freeze({ close });
    },
    executeOps(cookie, serialized) {
      if (phase !== 'started' || opsUsed) throw Error('One fixed strict ops invocation');
      opsUsed = true;
      opsPromise = new Promise((resolve, reject) => {
        opsResolve = resolve;
        opsReject = reject;
      });
      opsPromise.catch(() => {});
      child.send({ command: 'execute-ops', cookie, serialized }, error => {
        if (error) refuse();
      });
      return opsPromise;
    },
    origin: () => ready,
    close,
  });
}
