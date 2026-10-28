// Dedicated fixed email-observation child; original runtime client remains unchanged.
// Only content-free marker counts escape stderr; no transport configuration is accepted.
import { fork } from 'node:child_process';
import path from 'node:path';
import { createM4EmailMarker } from './db-access-m4-email-marker.mjs';
import { observeM4ChildLifecycle } from './db-access-m4-child-lifecycle.mjs';
const fail = () => Error('M4 restricted child failed');
export async function openM4EmailObserverChild(root) {
  const child = fork(path.join(root, 'db-access-m4-runtime-child.mjs'), [], {
    cwd: root,
    execArgv: [],
    serialization: 'advanced',
    silent: true,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: path.join(root, 'home'),
      TMPDIR: path.join(root, 'tmp'),
      TZ: 'UTC',
      LANG: 'C.UTF-8',
      NODE_ENV: 'production',
    },
  });
  let next = 0,
    runtimeId = 0,
    closed = false,
    forced = false,
    aborted = false;
  const observation = createM4EmailMarker();
  const pending = new Map();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const lifecycle = observeM4ChildLifecycle(child);
  async function retireFailure() {
    abort();
    try {
      await lifecycle.waitForExit();
    } finally {
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.destroy();
    }
  }
  function abort() {
    if (aborted) return;
    aborted = true;
    forced = true;
    observation.reject();
    clearTimeout(startup);
    rejectReady(fail());
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(fail());
    }
    pending.clear();
    try {
      child.kill('SIGKILL');
    } catch {
      /* strict aborted state remains decisive */
    }
  }
  const startup = setTimeout(abort, 10000);
  for (const name of ['stdout', 'stderr'])
    child[name].on('data', chunk => {
      try {
        observation.feed(name, chunk);
      } catch {
        abort();
      }
    });
  child.stdout.on('error', abort);
  child.stderr.on('error', abort);
  child.on('error', abort);
  child.on('exit', () => {
    if (!closed) abort();
  });
  child.on('message', message => {
    if (message?.ready === true) {
      if (message.administratorCredentialPresent !== false) return abort();
      clearTimeout(startup);
      resolveReady();
      return;
    }
    const item = pending.get(message?.id);
    if (!item) return abort();
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.ok === true) item.resolve(message.result);
    else item.reject(fail());
  });
  try {
    await ready;
  } catch (error) {
    await retireFailure();
    throw error;
  }
  function call(op, args) {
    if (closed || aborted) return Promise.reject(fail());
    const id = ++next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(abort, 20000);
      pending.set(id, { resolve, reject, timer });
      child.send({ id, op, args }, error => {
        if (error) abort();
      });
    });
  }
  function create(profile, configuration) {
    const id = ++runtimeId;
    const names =
      profile === 'ops'
        ? ['close', 'execute']
        : ['close', 'execute', 'executeLegacyAdmin', 'executeLegacyAgent', 'executeStaff'];
    const created = call('create', [id, profile, configuration]).then(result => {
      if (result?.frozen !== true || JSON.stringify(result.methods) !== JSON.stringify(names))
        throw fail();
    });
    const facade = Object.fromEntries(
      names.map(method => [
        method,
        async (...args) => {
          await created;
          return call('invoke', [id, method, args]);
        },
      ])
    );
    return Object.freeze(facade);
  }
  return Object.freeze({
    createOps: configuration => create('ops', configuration),
    createProfiles: configuration => create('profiles', configuration),
    probePosture: url => call('posture', [url]),
    probeInvalidConfigurations: configuration => call('invalid-configurations', [configuration]),
    emailUnavailableCount: () => observation.count(),
    waitForEmailUnavailableCount: expected => observation.waitForCount(expected),
    async close() {
      if (closed) throw fail();
      if (aborted) {
        await retireFailure();
        throw fail();
      }
      let termination;
      try {
        await call('shutdown', []);
        const fence = await call('output-fence', []);
        if (JSON.stringify(fence) !== JSON.stringify({ stdoutFlushed: true, stderrFlushed: true }))
          throw fail();
        closed = true;
        child.disconnect();
        termination = await lifecycle.waitForExitAndEOF();
      } catch (error) {
        await retireFailure();
        throw error;
      } finally {
        clearTimeout(startup);
      }
      if (aborted) throw fail();
      return observation.finish({
        ...termination,
        forced,
        outputFenceAcknowledged: true,
      });
    },
  });
}
