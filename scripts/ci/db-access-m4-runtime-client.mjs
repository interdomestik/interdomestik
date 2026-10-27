// Fixed fixture-only IPC client. No candidate module executes in the provisioning process.
import { fork } from 'node:child_process';
import path from 'node:path';
const fail = () => Error('M4 restricted child failed');
export async function openM4RestrictedChild(root, tls) {
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
    outputBytes = 0;
  const pending = new Map();
  const facadeIds = new WeakMap();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const exited = new Promise(resolve =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  function abort() {
    rejectReady(fail());
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(fail());
    }
    pending.clear();
    child.kill('SIGKILL');
  }
  const startup = setTimeout(abort, 10000);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) abort();
    });
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
  await ready;
  function call(op, args) {
    if (closed) return Promise.reject(fail());
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
    const created = call('create', [
      id,
      profile,
      configuration,
      ...(profile === 'profiles' ? [tls] : []),
    ]).then(result => {
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
    facadeIds.set(facade, { id, created });
    return Object.freeze(facade);
  }
  return Object.freeze({
    createOps: configuration => create('ops', configuration),
    createProfiles: configuration => create('profiles', configuration),
    async invokeMounted(owner, profile, input) {
      const binding = facadeIds.get(owner);
      if (!binding) throw fail();
      await binding.created;
      // No operation is invoked by an untrusted runtime id or URL.
      return call('invoke-mounted', [binding.id, profile, input]);
    },
    probePosture: url => call('posture', [url]),
    probeInvalidConfigurations: configuration => call('invalid-configurations', [configuration]),
    async close() {
      if (closed) return;
      let completion;
      try {
        completion = await call('shutdown', []);
        if (
          completion?.closed !== runtimeId ||
          !Array.isArray(completion.assignmentContexts) ||
          completion.assignmentContexts.length !== runtimeId ||
          !completion.assignmentContexts.every((owner, index) => owner?.runtimeId === index + 1)
        )
          throw fail();
      } finally {
        // Refusal never skips retirement of this exact child, including IPC/validation errors.
        closed = true;
        for (const item of pending.values()) {
          clearTimeout(item.timer);
          item.reject(fail());
        }
        pending.clear();
        const kill = () => {
          try {
            child.kill('SIGKILL');
          } catch {}
        };
        let killTimer, exitTimer;
        try {
          try {
            child.disconnect();
          } catch {
            kill();
          }
          killTimer = setTimeout(kill, 4000);
          const termination = await Promise.race([
            exited,
            new Promise(resolve => {
              exitTimer = setTimeout(() => {
                kill();
                resolve(null);
              }, 5000);
            }),
          ]);
          if (!termination || termination.code !== 0 || termination.signal) throw fail();
        } finally {
          clearTimeout(killTimer);
          clearTimeout(exitTimer);
          clearTimeout(startup);
        }
      }
      return completion;
    },
  });
}
