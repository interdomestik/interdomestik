import { execFileSync, spawn } from 'node:child_process';

const activeProcessGroups = new Set();
const terminationSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
let cleanupHandlersInstalled = false;
let terminationInProgress = false;

function signalExitCode(signal) {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  if (signal === 'SIGHUP') return 129;
  return 1;
}

export function stopProcessGroup(pid, signal = 'SIGTERM') {
  if (!Number.isInteger(pid) || pid <= 0) return;

  try {
    const target = process.platform === 'win32' ? pid : -pid;
    process.kill(target, signal);
  } catch (error) {
    if (error?.code === 'ESRCH') return;
    console.warn(
      `Unable to send ${signal} to process group ${pid}: ${error?.code || error?.message || error}`
    );
  }
}

function stopActiveProcessGroups(signal = 'SIGTERM') {
  for (const pid of activeProcessGroups) {
    activeProcessGroups.delete(pid);
    stopProcessGroup(pid, signal);
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function portListenerPids(port) {
  try {
    return [
      ...new Set(
        execFileSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split(/\s+/)
          .map(value => Number.parseInt(value, 10))
          .filter(pid => Number.isInteger(pid) && pid > 0)
      ),
    ];
  } catch (error) {
    if (error?.status === 1) return [];
    throw error;
  }
}

export function cleanupE2ePort({ env = process.env, port = 3000 } = {}) {
  if (env.PW_EXTERNAL_SERVER === '1') return [];
  const pids = portListenerPids(port);
  for (const pid of pids) stopProcessGroup(pid);
  if (pids.length > 0) sleepSync(1000);
  for (const pid of portListenerPids(port).filter(pid => pids.includes(pid))) {
    stopProcessGroup(pid, 'SIGKILL');
  }
  return pids;
}

function installCleanupHandlers() {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  process.once('exit', () => stopActiveProcessGroups());
  for (const signal of terminationSignals) {
    process.on(signal, () => {
      if (terminationInProgress) return;
      terminationInProgress = true;
      stopActiveProcessGroups(signal);
      process.exit(signalExitCode(signal));
    });
  }
}

export async function runDetachedCommand(command, args, { cwd, env }) {
  installCleanupHandlers();

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (Number.isInteger(child.pid) && child.pid > 0) activeProcessGroups.add(child.pid);
    let spawnError = false;

    child.once('error', error => {
      spawnError = true;
      activeProcessGroups.delete(child.pid);
      stopProcessGroup(child.pid);
      reject(error);
    });

    child.once('close', (code, signal) => {
      if (spawnError) return;
      stopProcessGroup(child.pid);
      activeProcessGroups.delete(child.pid);

      if (code === 0) {
        resolve();
        return;
      }

      const status = signal ? `signal ${signal}` : `status ${code}`;
      const error = new Error(`${command} exited with ${status}`);
      error.exitCode = code ?? signalExitCode(signal);
      reject(error);
    });
  });
}
