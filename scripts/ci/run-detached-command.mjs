import { spawn } from 'node:child_process';

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
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code === 'ESRCH') return;
    console.warn(
      `Unable to send ${signal} to process group ${pid}: ${error?.code || error?.message || error}`
    );
  }
}

function stopActiveProcessGroups(signal = 'SIGTERM') {
  for (const pid of [...activeProcessGroups]) {
    activeProcessGroups.delete(pid);
    stopProcessGroup(pid, signal);
  }
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

      const error = new Error(
        `${command} exited with ${signal ? `signal ${signal}` : `status ${code}`}`
      );
      error.exitCode = code ?? signalExitCode(signal);
      reject(error);
    });
  });
}
